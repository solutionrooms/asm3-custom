#!/usr/bin/env python3
"""
Import hedgehog weight history CSV and store as Daily Observation logs.

This uses the same storage as the hedgehog_observation endpoint:
 - Writes to the `log` table via asm3.log.add_log with LinkType=ANIMAL
 - Uses the configured Behave log type (Options -> Daily Observations)
 - Persists values in Comments as "key=value" pairs, comma-separated

CSV columns expected (header names):
  Date,Hedgehog,Location,Weight,Action,Next Weighing,Non insulated,Comments

Usage (inside container):
  ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/import_weights_history.py \
      --csv "/app/raw_data/weights export.csv"

Options:
  --csv PATH        Path to the CSV file (default: /app/raw_data/weights export.csv)
  --dry-run         Do not write to DB, just print actions
  --alias NAME      Database alias (for multi-db setups); defaults to current
  --logtype ID      Override BehaveLogType (int). If not set, uses config.
  --user NAME       Username to attribute logs to (default: weights-import)
  --delete-existing Delete all previous logs created by --user for the chosen log type before importing
  --db-type T       Override DB type (POSTGRESQL|MYSQL|SQLITE|DB2)
  --db-host H       Override DB host
  --db-port P       Override DB port
  --db-name N       Override DB name
  --db-user U       Override DB username
  --db-pass PWD     Override DB password

Notes:
 - Animal lookup uses the Hedgehog column (animal name) and resolves recent/on-shelter
   animals via asm3.animal.get_recent_with_name.
 - The log Date is set from the CSV Date (local noon).
 - All CSV columns are preserved as key=value pairs in the Comments field, so the
   observations history UI can parse/display configured keys that match.
 - Simple duplicate guard: skips creating a log if an existing log for that animal and
   date already includes the same Weight value in its comment map.
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
    """Parse dates like 25/09/2022 or 16/07/1905; return datetime at 12:00."""
    d = (d or "").strip()
    if not d:
        return None
    # Try D/M/Y and alternatives
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
    parts = []
    for k in [
        "Weight",
        "Location",
        "Action",
        "Next Weighing",
        "Non insulated",
        "Comments",
    ]:
        if k in m and m[k] is not None and m[k] != "":
            parts.append(f"{k}={m[k]}")
    # Ensure any additional keys are also included
    for k in sorted(m.keys()):
        if k in ("Weight", "Location", "Action", "Next Weighing", "Non insulated", "Comments"):
            continue
        v = m[k]
        if v is not None and v != "":
            parts.append(f"{k}={v}")
    return ", ".join(parts)


def parse_observation_map(s: str) -> dict:
    """Parse comment string back into a map (compatible with UI logic)."""
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


def weight_to_grams_numeric_str(w: str) -> str:
    """Convert a weight string to a numeric grams string (no unit).
    Accepted formats: '1021g', '1.02kg', '1021', '1021.5', '1,021g'.
    - 'kg' values are multiplied by 1000.
    - trailing 'g' removed.
    - returns '' if input blank.
    Raises ValueError if cannot parse as a number.
    """
    s = (w or "").strip().lower()
    if s == "":
        return ""
    s = s.replace(",", "").strip()
    mult = 1.0
    if s.endswith("kg"):
        mult = 1000.0
        s = s[:-2].strip()
    elif s.endswith("g"):
        s = s[:-1].strip()
    elif s.endswith("lbs") or s.endswith("lb"):
        # simple conversion if given in pounds
        mult = 453.59237
        s = s[:-3].strip() if s.endswith("lbs") else s[:-2].strip()
    # Now s should be a number
    v = float(s)
    grams = v * mult
    # store as integer grams to keep consistent
    return str(int(round(grams)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", dest="csv_path", default="/app/raw_data/weights export.csv")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--alias", default="")
    ap.add_argument("--logtype", type=int, default=0)
    ap.add_argument("--user", default="weights-import")
    ap.add_argument("--delete-existing", action="store_true",
                    help="delete prior logs created by --user for this log type before import")
    ap.add_argument("--include-archived", action="store_true",
                    help="match animals by name across all animals, not only recent/on-shelter")
    ap.add_argument("--db-type")
    ap.add_argument("--db-host")
    ap.add_argument("--db-port", type=int)
    ap.add_argument("--db-name")
    ap.add_argument("--db-user")
    ap.add_argument("--db-pass")
    args = ap.parse_args()

    # DB connect
    dbo = db.get_database(args.alias)
    # Apply direct DB overrides if provided
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

    # Resolve log type: use configured BehaveLogType unless overridden
    behave_logtype = args.logtype or configuration.cint(dbo, "BehaveLogType", 3)

    al.info(f"weights import start: csv={args.csv_path}, dry={args.dry_run}, logtype={behave_logtype}, user={args.user}, delete_existing={args.delete_existing}",
            "custom.import_weights_history", dbo)

    # Optionally delete previous imports created by our user for this log type
    if args.delete_existing:
        q = "SELECT ID FROM log WHERE CreatedBy = ? AND LinkType = 0 AND LogTypeID = ?"
        rows = dbo.query(q, [args.user, behave_logtype])
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
            al.info(f"deleted existing logs: {deleted}", "custom.import_weights_history", dbo)

    # Open CSV
    created = 0
    skipped = 0
    missing = 0
    missing_names = {}
    with open(args.csv_path, newline='', encoding='utf-8-sig') as f:
        rdr = csv.DictReader(f)
        # Normalise headers
        fieldmap = { (h or "").strip(): (h or "").strip() for h in rdr.fieldnames or [] }
        required_cols = ["Date", "Hedgehog", "Location", "Weight", "Action", "Next Weighing", "Non insulated", "Comments"]
        for col in required_cols:
            if col not in fieldmap:
                al.warn(f"CSV missing expected column '{col}'", "custom.import_weights_history", dbo)

        for lineno, row in enumerate(rdr, start=2):
            date_s = (row.get("Date") or "").strip()
            hog_name = (row.get("Hedgehog") or "").strip()
            location = (row.get("Location") or "").strip()
            weight_raw = row.get("Weight")
            # Convert weight to numeric grams string (no trailing unit)
            try:
                weight = weight_to_grams_numeric_str(weight_raw)
            except Exception as e:
                print(f"ERROR line {lineno}: invalid weight '{weight_raw}' for {hog_name} on {date_s}: {e}", file=sys.stderr)
                skipped += 1
                continue
            action = (row.get("Action") or "").strip()
            next_weigh = (row.get("Next Weighing") or "").strip()
            non_insul = (row.get("Non insulated") or "").strip()
            comments = (row.get("Comments") or "").strip()

            if not hog_name:
                skipped += 1
                continue
            try:
                log_dt = parse_date(date_s)
            except Exception as e:
                al.warn(f"row skipped: invalid date '{date_s}' for {hog_name}: {e}", "custom.import_weights_history", dbo)
                skipped += 1
                continue

            # Resolve animal by name. By default, recent/on-shelter; optionally include archived
            if args.include_archived:
                # Prefer exact match (case-insensitive), latest ID first
                candidates = dbo.query(
                    "SELECT ID AS ANIMALID, ShelterCode, AnimalName FROM animal "
                    "WHERE LOWER(AnimalName) = ? ORDER BY ID DESC", [hog_name.lower()])
            else:
                candidates = animal.get_recent_with_name(dbo, hog_name)
            if not candidates:
                # Tally missing silently to avoid noisy logs in large imports
                missing += 1
                if hog_name:
                    missing_names[hog_name] = missing_names.get(hog_name, 0) + 1
                continue
            aid = int(candidates[0]["ANIMALID"])

            # Build comment string as key=value pairs. Start with known columns
            # and then include any additional CSV columns except Date/Hedgehog.
            cmap = {
                "Weight": weight,
                "Location": location,
                "Action": action,
                "Next Weighing": next_weigh,
                "Non insulated": non_insul,
                "Comments": comments,
            }
            for k, v in row.items():
                if k in ("Date", "Hedgehog"):
                    continue
                if k in cmap:
                    continue
                if v is None or str(v).strip() == "":
                    continue
                cmap[str(k).strip()] = str(v).strip()
            comment_str = comment_map_to_string(cmap)

            # Duplicate guard: if an existing log on the same day has the same Weight, skip
            # Fetch recent logs of this type for animal (limit a reasonable window)
            dup_found = False
            try:
                logs = log.get_logs(dbo, log.ANIMAL, aid, behave_logtype)
                for r in logs:
                    try:
                        existing_day = (r["DATE"].date() if hasattr(r["DATE"], 'date') else None)
                        if existing_day and log_dt and existing_day == log_dt.date():
                            m = parse_observation_map(r["COMMENTS"])
                            # Normalize any prior Weight (with or without units) to grams
                            prior_w = m.get("Weight") or ""
                            if prior_w != "":
                                try:
                                    prior_g = weight_to_grams_numeric_str(prior_w)
                                except Exception:
                                    # Fallback: strip non-numeric
                                    import re
                                    prior_g = re.sub(r"[^0-9]", "", str(prior_w))
                                if prior_g == weight:
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
                print(f"DRY: would add log animal={aid} name={hog_name} date={log_dt} comments={comment_str}")
                created += 1
            else:
                log.add_log(dbo, args.user, log.ANIMAL, aid, behave_logtype, comment_str, log_dt)
                created += 1

    al.info(f"weights import end: created={created}, skipped={skipped}, missing_animals={missing}",
            "custom.import_weights_history", dbo)
    if missing:
        # Show up to 10 example missing names with counts
        examples = sorted(missing_names.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        sample = ", ".join([f"{n}({c})" for n, c in examples])
        al.info(f"missing examples: {sample}", "custom.import_weights_history", dbo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
