#!/usr/bin/env python3
"""
Import hedgehog poo sample history CSV and store as Daily Observation logs.

Destination matches hedgehog_observation:
 - Writes to `log` with LinkType=ANIMAL
 - Uses configured Behave log type (Options -> Daily Observations)
 - Saves values in Comments as comma-separated key=value pairs

CSV expected headers (extra/blank columns ignored):
  Date, Patient Name, Poo Sample - Cap, Poo Sample - Fluke, Poo Sample - Lungworm, Poo Sample - Clear

Usage examples:
  ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/import_poo_samples_history.py \
      --csv "/app/raw_data/poo_samples_export.csv" --delete-existing

Local with DB flags:
  python3 custom_scripts/import_poo_samples_history.py --csv "raw_data/poo_samples_export.csv" \
      --include-archived --db-type POSTGRESQL --db-host localhost --db-port 5432 \
      --db-name asm3 --db-user asm3 --db-pass asm3

Options:
  --csv PATH            Path to CSV (default: /app/raw_data/poo_samples_export.csv)
  --dry-run             Do not write to DB, just print actions
  --alias NAME          Database alias for multi-db setups
  --logtype ID          Override Daily Observations log type; default uses config
  --user NAME           Username to attribute logs to (default: poo-import)
  --delete-existing     Delete prior logs created by --user for this log type before import
  --include-archived    Match animals by name across all animals, not only recent/on-shelter
  --db-type/--db-host/--db-port/--db-name/--db-user/--db-pass  Direct DB overrides
"""

import argparse
import csv
import os
import sys
from datetime import datetime, time

# Ensure asm3 is importable (container path first, then local repo fallback)
if "/app/src" not in sys.path:
    sys.path.insert(0, "/app/src")
if not os.path.isdir("/app/src"):
    here = os.path.dirname(os.path.abspath(__file__))
    repo_src = os.path.normpath(os.path.join(here, "..", "src"))
    if repo_src not in sys.path:
        sys.path.insert(0, repo_src)

import asm3.al as al
import asm3.animal as animal
import asm3.configuration as configuration
import asm3.db as db
import asm3.log as log


def parse_date(d: str) -> datetime:
    """Parse dates like 25/09/2023; return datetime at 12:00."""
    d = (d or "").strip()
    if not d:
        return None
    fmts = ["%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"]
    last_err = None
    for f in fmts:
        try:
            dt = datetime.strptime(d, f)
            return datetime.combine(dt.date(), time(12, 0))
        except Exception as e:
            last_err = e
    raise ValueError(f"Unrecognised date format: '{d}' ({last_err})")


def comment_map_to_string(m: dict) -> str:
    """Convert dict to comma-separated key=value string in stable key order."""
    ordered = []
    for k in sorted(m.keys()):
        v = m[k]
        if v is not None and str(v).strip() != "":
            ordered.append(f"{k}={v}")
    return ", ".join(ordered)


def parse_observation_map(s: str) -> dict:
    m = {}
    try:
        for part in (s or "").split(','):
            p = part.split('=')
            if len(p) >= 2:
                key = p[0].strip()
                val = "=".join(p[1:]).strip()
                m[key] = val
    except Exception:
        pass
    return m

# Result field names and mapping
SAMPLE_FIELDS = [
    ("Poo Sample - Cap", "Cap"),
    ("Poo Sample - Fluke", "Fluke"),
    ("Poo Sample - Lungworm", "Lungworm"),
    ("Poo Sample - Clear", "Clear"),
]

def derive_sample_result_from_map(m: dict) -> str:
    """Derive normalized poo_sample_result from a parsed comments map.
    Supports both new format (poo_sample_result=...) and legacy column-per-result logs.
    Returns normalized title-cased string or '' if not derivable.
    """
    if not isinstance(m, dict):
        return ""
    if "poo_sample_result" in m and str(m["poo_sample_result"]).strip() != "":
        s = str(m["poo_sample_result"]).strip()
        parts = [p.strip().capitalize() for p in s.split(" and ") if p.strip()]
        return " and ".join(parts)
    hits = []
    for k, label in SAMPLE_FIELDS:
        v = m.get(k)
        if v is not None and str(v).strip() != "":
            hits.append(label)
    if not hits:
        return ""
    return " and ".join(hits)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", dest="csv_path", default="/app/raw_data/poo_samples_export.csv")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--alias", default="")
    ap.add_argument("--logtype", type=int, default=0)
    ap.add_argument("--user", default="poo-import")
    ap.add_argument("--delete-existing", action="store_true")
    ap.add_argument("--include-archived", action="store_true")
    # Direct DB overrides
    ap.add_argument("--db-type")
    ap.add_argument("--db-host")
    ap.add_argument("--db-port", type=int)
    ap.add_argument("--db-name")
    ap.add_argument("--db-user")
    ap.add_argument("--db-pass")
    args = ap.parse_args()

    # DB connect
    dbo = db.get_database(args.alias)
    if any([args.db_type, args.db_host, args.db_port, args.db_name, args.db_user, args.db_pass]):
        t = (args.db_type or dbo.dbtype or "POSTGRESQL").upper()
        dbo = db.get_dbo(t)
        if args.db_host: dbo.host = args.db_host
        if args.db_port: dbo.port = int(args.db_port)
        if args.db_name: dbo.database = args.db_name
        if args.db_user: dbo.username = args.db_user
        if args.db_pass: dbo.password = args.db_pass
    dbo.timeout = 0
    dbo.connection = dbo.connect()
    dbo.installpath = os.getcwd() + os.sep

    behave_logtype = args.logtype or configuration.cint(dbo, "BehaveLogType", 3)

    al.info(f"poo import start: csv={args.csv_path}, dry={args.dry_run}, logtype={behave_logtype}, user={args.user}, delete_existing={args.delete_existing}",
            "custom.import_poo_samples_history", dbo)

    # Optional cleanup of previous imports
    if args.delete_existing:
        rows = dbo.query("SELECT ID FROM log WHERE CreatedBy = ? AND LinkType = 0 AND LogTypeID = ?", [args.user, behave_logtype])
        if args.dry_run:
            print(f"DRY: would delete {len(rows)} existing logs CreatedBy='{args.user}' LogTypeID={behave_logtype}")
        else:
            deleted = 0
            for r in rows:
                try:
                    dbo.delete("log", r.ID, args.user)
                    deleted += 1
                except Exception as e:
                    print(f"WARN: failed to delete log ID={r.ID}: {e}", file=sys.stderr)
            al.info(f"deleted existing logs: {deleted}", "custom.import_poo_samples_history", dbo)

    created = 0
    skipped = 0
    missing = 0
    missing_names = {}

    with open(args.csv_path, newline='', encoding='utf-8-sig') as f:
        rdr = csv.DictReader(f)
        # Clean header names (strip BOM/whitespace); drop blank headers
        rdr.fieldnames = [ (h or "").strip() for h in (rdr.fieldnames or []) ]
        rdr.fieldnames = [ h for h in rdr.fieldnames if h != "" ]

        for lineno, row in enumerate(rdr, start=2):
            date_s = (row.get("Date") or "").strip()
            name = (row.get("Patient Name") or "").strip()
            # Normalize values for known columns (title case results)
            cap = (row.get("Poo Sample - Cap") or "").strip()
            fluke = (row.get("Poo Sample - Fluke") or "").strip()
            lungworm = (row.get("Poo Sample - Lungworm") or "").strip()
            clear = (row.get("Poo Sample - Clear") or "").strip()

            if not name:
                skipped += 1
                continue
            try:
                log_dt = parse_date(date_s)
            except Exception as e:
                print(f"ERROR line {lineno}: invalid date '{date_s}' for {name}: {e}", file=sys.stderr)
                skipped += 1
                continue

            # Resolve animal
            if args.include_archived:
                candidates = dbo.query("SELECT ID AS ANIMALID, ShelterCode, AnimalName FROM animal WHERE LOWER(AnimalName) = ? ORDER BY ID DESC", [name.lower()])
            else:
                candidates = animal.get_recent_with_name(dbo, name)
            if not candidates:
                missing += 1
                missing_names[name] = missing_names.get(name, 0) + 1
                continue
            aid = int(candidates[0]["ANIMALID"])

            # Build single result field
            selected = []
            if cap and cap.strip():
                selected.append("Cap")
            if fluke and fluke.strip():
                selected.append("Fluke")
            if lungworm and lungworm.strip():
                selected.append("Lungworm")
            if clear and clear.strip():
                selected.append("Clear")
            if not selected:
                skipped += 1
                continue
            result_value = " and ".join(selected)
            cmap = { "poo_sample_result": result_value }
            comment_str = comment_map_to_string(cmap)

            # Duplicate guard: skip if same-day log with identical poo_sample_result exists
            dup_found = False
            try:
                logs = log.get_logs(dbo, log.ANIMAL, aid, behave_logtype)
                for r in logs:
                    try:
                        existing_day = (r["DATE"].date() if hasattr(r["DATE"], 'date') else None)
                        if existing_day and log_dt and existing_day == log_dt.date():
                            existing_map = parse_observation_map(r["COMMENTS"])
                            existing_val = derive_sample_result_from_map(existing_map)
                            if existing_val and existing_val == result_value:
                                dup_found = True
                                break
                    except Exception:
                        pass
            except Exception:
                pass
            if dup_found:
                skipped += 1
                continue

            if args.dry_run:
                print(f"DRY: would add log animal={aid} name={name} date={log_dt} comments={comment_str}")
                created += 1
            else:
                log.add_log(dbo, args.user, log.ANIMAL, aid, behave_logtype, comment_str, log_dt)
                created += 1

    al.info(f"poo import end: created={created}, skipped={skipped}, missing_animals={missing}",
            "custom.import_poo_samples_history", dbo)
    if missing:
        examples = sorted(missing_names.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        sample = ", ".join([f"{n}({c})" for n, c in examples])
        al.info(f"missing examples: {sample}", "custom.import_poo_samples_history", dbo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
