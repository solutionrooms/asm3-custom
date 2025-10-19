#!/usr/bin/env python3
"""Merge duplicate owners (person records) sharing the same OwnerName.

For each duplicate group:
  * Keep the lowest owner ID as the canonical record.
  * Reparent all linked data from the duplicates onto the canonical record
    using asm3.person.merge_person.
  * Combine contact details so we retain every unique value:
      - When multiple distinct values exist, join them with " or ".
      - When a field was blank on the canonical record but populated on a
        duplicate, pull the populated value across.
      - Preserve boolean person flags when any duplicate has them set.

The script is intended to run inside the ASM3 container. When invoked from
the host it will re-exec itself via `docker-compose exec asm3 …`.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

CONTAINER_ENV_FLAG = "ASM3_SCRIPT_CONTAINER"
USERNAME = "duplicate-merge"


def _reexec_inside_container() -> None:
    """Re-run the script inside the asm3 container if necessary."""
    if os.environ.get(CONTAINER_ENV_FLAG) == "1":
        return

    docker_compose = shutil.which("docker-compose")
    if docker_compose is None:
        # When docker-compose is unavailable we're likely already inside the container.
        if Path("/app").exists():
            os.environ[CONTAINER_ENV_FLAG] = "1"
            return
        print(
            "ERROR: docker-compose not found. Run inside the asm3 container:\n"
            "       docker-compose exec asm3 python3 /app/custom_scripts/merge_duplicate_owners.py",
            file=sys.stderr,
        )
        sys.exit(1)

    cmd = [
        docker_compose,
        "exec",
        "-T",
        "asm3",
        "env",
        f"{CONTAINER_ENV_FLAG}=1",
        "python3",
        "/app/custom_scripts/merge_duplicate_owners.py",
        *sys.argv[1:],
    ]
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode)
    sys.exit(0)


_reexec_inside_container()

# Inside the container we expect ASM3_CONF to point at /app/asm3.conf.
ASM3_CONF = os.environ.get("ASM3_CONF")
if not ASM3_CONF or not Path(ASM3_CONF).exists():
    print(
        f"ERROR: ASM3_CONF is not set or file is missing ({ASM3_CONF}). "
        "Ensure the container is running and ASM3_CONF is configured.",
        file=sys.stderr,
    )
    sys.exit(2)

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_PATH = SCRIPT_DIR.parent / "src"
src_path_str = str(SRC_PATH)
if src_path_str not in sys.path:
    sys.path.insert(0, src_path_str)

import asm3.additional  # type: ignore  # noqa: E402
import asm3.db  # type: ignore  # noqa: E402
import asm3.person  # type: ignore  # noqa: E402
import asm3.utils  # type: ignore  # noqa: E402
from asm3.sitedefs import MULTIPLE_DATABASES, MULTIPLE_DATABASES_MAP  # type: ignore  # noqa: E402


# Columns we want to consolidate across duplicates. Keys are the uppercase
# column names returned by dbo.query; values describe how to handle them.
# - label: user-friendly name used in output
# - merge_key: argument name for merge_person_details (if applicable)
# - update_key: column name passed to dbo.update (CamelCase, as in schema)
FIELD_CONFIG: Dict[str, Dict[str, str]] = {
    "OWNERTITLE": {"label": "OwnerTitle", "merge_key": "title"},
    "OWNERINITIALS": {"label": "OwnerInitials", "merge_key": "initials"},
    "OWNERFORENAMES": {"label": "OwnerForeNames", "update_key": "OwnerForeNames"},
    "OWNERSURNAME": {"label": "OwnerSurname", "update_key": "OwnerSurname"},
    "OWNERTITLE2": {"label": "OwnerTitle2", "merge_key": "title2"},
    "OWNERINITIALS2": {"label": "OwnerInitials2", "merge_key": "initials2"},
    "OWNERFORENAMES2": {"label": "OwnerForeNames2", "merge_key": "forenames2"},
    "OWNERSURNAME2": {"label": "OwnerSurname2", "merge_key": "surname2"},
    "OWNERADDRESS": {"label": "OwnerAddress", "merge_key": "address"},
    "OWNERTOWN": {"label": "OwnerTown", "merge_key": "town"},
    "OWNERCOUNTY": {"label": "OwnerCounty", "merge_key": "county"},
    "OWNERPOSTCODE": {"label": "OwnerPostcode", "merge_key": "postcode"},
    "OWNERCOUNTRY": {"label": "OwnerCountry", "merge_key": "country"},
    "HOMETELEPHONE": {"label": "HomeTelephone", "merge_key": "hometelephone"},
    "WORKTELEPHONE": {"label": "WorkTelephone", "merge_key": "worktelephone"},
    "WORKTELEPHONE2": {"label": "WorkTelephone2", "update_key": "WorkTelephone2"},
    "MOBILETELEPHONE": {"label": "MobileTelephone", "merge_key": "mobiletelephone"},
    "MOBILETELEPHONE2": {"label": "MobileTelephone2", "merge_key": "mobiletelephone2"},
    "EMAILADDRESS": {"label": "EmailAddress", "merge_key": "emailaddress"},
    "EMAILADDRESS2": {"label": "EmailAddress2", "merge_key": "emailaddress2"},
    "IDENTIFICATIONNUMBER": {"label": "IdentificationNumber", "merge_key": "idnumber"},
    "IDENTIFICATIONNUMBER2": {"label": "IdentificationNumber2", "merge_key": "idnumber2"},
    "COMMENTS": {"label": "Comments", "merge_key": "comments"},
    "HOMECHECKAREAS": {"label": "HomeCheckAreas", "update_key": "HomeCheckAreas"},
    "MEMBERSHIPNUMBER": {"label": "MembershipNumber", "merge_key": "membershipnumber"},
}

# Person flag columns that should remain enabled if any duplicate has them set.
FLAG_COLUMNS = {
    "ISBANNED": "IsBanned",
    "ISVOLUNTEER": "IsVolunteer",
    "ISHOMECHECKER": "IsHomeChecker",
    "ISMEMBER": "IsMember",
    "ISDONOR": "IsDonor",
    "ISDRIVER": "IsDriver",
    "ISSHELTER": "IsShelter",
    "ISACO": "IsACO",
    "ISSTAFF": "IsStaff",
    "ISFOSTERER": "IsFosterer",
    "ISRETAILER": "IsRetailer",
    "ISVET": "IsVet",
    "ISGIFTAID": "IsGiftAid",
    "EXCLUDEFROMBULKEMAIL": "ExcludeFromBulkEmail",
    "IDCHECK": "IDCheck",
}


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge duplicate owners sharing the same OwnerName.")
    parser.add_argument(
        "--alias",
        default=None,
        help="Database alias when multiple databases are configured (e.g. bghr).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned merges without modifying the database.",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Only process duplicates that exactly match this OwnerName (case-insensitive).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most this many duplicate groups.",
    )
    return parser.parse_args(argv[1:])


def _clean_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _unique_values(rows: Iterable[asm3.db.ResultRow], column: str) -> List[str]:
    seen: set[str] = set()
    values: List[str] = []
    for row in rows:
        if column not in row:
            continue
        raw = _clean_str(row.get(column))
        if not raw:
            continue
        key = raw.casefold()
        if key in seen:
            continue
        seen.add(key)
        values.append(raw)
    return values


def _combine_values(values: List[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    return " or ".join(values)


def prepare_updates(
    rows: List[asm3.db.ResultRow],
    primary: asm3.db.ResultRow,
) -> Tuple[Dict[str, str], Dict[str, str], List[Tuple[str, List[str]]]]:
    """Return (merge_details, direct_updates, change_summary)."""
    merge_details: Dict[str, str] = {}
    direct_updates: Dict[str, str] = {}
    changes: List[Tuple[str, List[str]]] = []

    for column, cfg in FIELD_CONFIG.items():
        values = _unique_values(rows, column)
        if not values:
            continue
        combined = _combine_values(values)

        if cfg.get("merge_key"):
            merge_details[cfg["merge_key"]] = combined
        if cfg.get("update_key"):
            direct_updates[cfg["update_key"]] = combined

        current = _clean_str(primary.get(column))
        if combined and combined.casefold() != current.casefold():
            changes.append((cfg["label"], values))

    return merge_details, direct_updates, changes


def prepare_flag_updates(rows: List[asm3.db.ResultRow]) -> Tuple[Dict[str, int], List[str]]:
    updates: Dict[str, int] = {}
    labels: List[str] = []
    for column, update_key in FLAG_COLUMNS.items():
        any_true = False
        for row in rows:
            if column not in row:
                continue
            if asm3.utils.cint(row.get(column) or 0):
                any_true = True
                break
        if any_true:
            updates[update_key] = 1
            labels.append(update_key)
    return updates, labels


def determine_owner_type(rows: List[asm3.db.ResultRow], current: int) -> Tuple[int | None, bool]:
    types = []
    for row in rows:
        if "OWNERTYPE" in row and row.get("OWNERTYPE") is not None:
            types.append(asm3.utils.cint(row.get("OWNERTYPE")))
    if not types:
        return None, False
    desired = max(types)
    if desired and desired != current:
        return desired, True
    return None, False


def fetch_duplicate_groups(dbo, owner_name_filter: str | None = None) -> List[str]:
    sql = (
        "SELECT lower(trim(OwnerName)) AS NameKey, COUNT(*) AS Cnt "
        "FROM owner "
        "GROUP BY lower(trim(OwnerName)) "
        "HAVING COUNT(*) > 1 "
        "ORDER BY lower(trim(OwnerName))"
    )
    params: List[str] | None = None
    if owner_name_filter:
        sql = (
            "SELECT lower(trim(OwnerName)) AS NameKey, COUNT(*) AS Cnt "
            "FROM owner "
            "WHERE lower(trim(OwnerName)) = lower(trim(?)) "
            "GROUP BY lower(trim(OwnerName)) "
            "HAVING COUNT(*) > 1 "
            "ORDER BY lower(trim(OwnerName))"
        )
        params = [owner_name_filter]
    rows = dbo.query(sql, params)
    return [row.NAMEKEY for row in rows]


def fetch_group_records(dbo, name_key: str) -> List[asm3.db.ResultRow]:
    return dbo.query(
        "SELECT * FROM owner WHERE lower(trim(OwnerName)) = ? ORDER BY ID",
        [name_key],
    )


def _fetch_additional(dbo, person_id: int) -> List[asm3.db.ResultRow]:
    clause = asm3.additional.PERSON_IN
    return dbo.query(
        "SELECT a.LinkType, a.AdditionalFieldID, a.Value, af.FieldName "
        "FROM additional a "
        "INNER JOIN additionalfield af ON af.ID = a.AdditionalFieldID "
        f"WHERE a.LinkID = ? AND a.LinkType IN ({clause})",
        [person_id],
    )


def _merge_text(existing: str, new_value: str) -> str:
    existing = existing.strip()
    new_value = new_value.strip()
    if not existing:
        return new_value
    parts = [p.strip() for p in existing.split(" or ") if p.strip()]
    seen = {p.casefold() for p in parts}
    if new_value and new_value.casefold() not in seen:
        parts.append(new_value)
    return " or ".join(parts)


def cleanup_additional_conflicts(dbo, target_id: int, source_id: int) -> List[str]:
    """Ensure additional field rows from source won't clash when reparented."""
    notes: List[str] = []
    target_rows = _fetch_additional(dbo, target_id)
    target_map: Dict[Tuple[int, int], asm3.db.ResultRow] = {}
    for row in target_rows:
        key = (int(row.LINKTYPE), int(row.ADDITIONALFIELDID))
        target_map[key] = row

    source_rows = _fetch_additional(dbo, source_id)
    for row in source_rows:
        key = (int(row.LINKTYPE), int(row.ADDITIONALFIELDID))
        source_value = _clean_str(row.VALUE)
        if key not in target_map:
            continue  # no conflict, allow merge_person to reparent

        target_row = target_map[key]
        target_value = _clean_str(target_row.VALUE)
        field_name = row.FIELDNAME or f"Field {row.ADDITIONALFIELDID}"

        if not target_value and source_value:
            dbo.update(
                "additional",
                f"LinkType={int(target_row.LINKTYPE)} AND LinkID={target_id} AND AdditionalFieldID={int(target_row.ADDITIONALFIELDID)}",
                {"Value": source_value},
                USERNAME,
                setLastChanged=False,
                setRecordVersion=False,
                writeAudit=False,
            )
            target_row.VALUE = source_value
            notes.append(f"{field_name}: filled blank with '{source_value}'")
        elif source_value and source_value.casefold() != target_value.casefold():
            merged = _merge_text(target_value, source_value)
            if merged != target_value:
                dbo.update(
                    "additional",
                    f"LinkType={int(target_row.LINKTYPE)} AND LinkID={target_id} AND AdditionalFieldID={int(target_row.ADDITIONALFIELDID)}",
                    {"Value": merged},
                    USERNAME,
                    setLastChanged=False,
                    setRecordVersion=False,
                    writeAudit=False,
                )
                target_row.VALUE = merged
                notes.append(f"{field_name}: merged conflicting values into '{merged}'")
            else:
                notes.append(f"{field_name}: duplicate value '{source_value}' ignored")
        elif source_value:
            notes.append(f"{field_name}: duplicate value '{source_value}' ignored")

        dbo.delete(
            "additional",
            f"LinkType={int(row.LINKTYPE)} AND LinkID={source_id} AND AdditionalFieldID={int(row.ADDITIONALFIELDID)}",
            USERNAME,
            writeAudit=False,
            writeDeletion=False,
        )

    return notes


def recalc_owner_name(dbo, owner_id: int) -> None:
    row = dbo.first_row(
        dbo.query(
            "SELECT OwnerType, OwnerTitle, OwnerInitials, OwnerForeNames, OwnerSurname, "
            "OwnerTitle2, OwnerInitials2, OwnerForeNames2, OwnerSurname2 "
            "FROM owner WHERE ID = ?",
            [owner_id],
        )
    )
    if row is None:
        return
    owner_name = asm3.person.calculate_owner_name(
        dbo,
        asm3.utils.cint(row.OWNERTYPE or 0),
        row.OWNERTITLE or "",
        row.OWNERINITIALS or "",
        row.OWNERFORENAMES or "",
        row.OWNERSURNAME or "",
        "",
        "",
        "",
        row.OWNERTITLE2 or "",
        row.OWNERINITIALS2 or "",
        row.OWNERFORENAMES2 or "",
        row.OWNERSURNAME2 or "",
    )
    dbo.update("owner", owner_id, {"OwnerName": owner_name}, USERNAME)


def process_group(
    dbo,
    name_key: str,
    rows: List[asm3.db.ResultRow],
    dry_run: bool = False,
) -> Dict[str, object]:
    primary = rows[0]
    duplicates = rows[1:]
    merge_details, direct_updates, change_details = prepare_updates(rows, primary)
    flag_updates, flag_labels = prepare_flag_updates(rows)
    owner_type_update, owner_type_changed = determine_owner_type(
        rows, asm3.utils.cint(primary.get("OWNERTYPE") or 0)
    )

    summary = {
        "name": primary.get("OWNERNAME", name_key),
        "primary_id": int(primary.ID),
        "duplicate_ids": [int(r.ID) for r in duplicates],
        "changes": change_details,
        "flags": flag_labels,
        "owner_type": owner_type_update if owner_type_changed else None,
        "count": len(rows),
        "additional": [],
    }

    if dry_run:
        return summary

    additional_notes: List[str] = []

    for dup in duplicates:
        additional_notes.extend(
            cleanup_additional_conflicts(dbo, int(primary.ID), int(dup.ID))
        )
        asm3.person.merge_person(dbo, USERNAME, int(primary.ID), int(dup.ID))

    if merge_details:
        asm3.person.merge_person_details(dbo, USERNAME, int(primary.ID), merge_details, force=True)

    update_payload = {}
    update_payload.update(direct_updates)
    update_payload.update(flag_updates)
    if owner_type_changed and owner_type_update is not None:
        update_payload["OwnerType"] = owner_type_update

    if update_payload:
        dbo.update("owner", int(primary.ID), update_payload, USERNAME)

    recalc_owner_name(dbo, int(primary.ID))
    summary["additional"] = additional_notes
    return summary


def print_summary(alias_label: str, summary: Dict[str, object], dry_run: bool) -> None:
    action = "Would merge" if dry_run else "Merged"
    dup_ids = summary["duplicate_ids"]
    dup_str = ", ".join(str(i) for i in dup_ids) if dup_ids else "none"
    print(
        f"[alias: {alias_label}] {action} owner '{summary['name']}' "
        f"(keep ID {summary['primary_id']}; remove {dup_str})."
    )

    for label, values in summary.get("changes", []):
        if not values:
            continue
        if len(values) == 1:
            value_str = values[0]
        else:
            value_str = " | ".join(values)
        print(f"    {label}: {value_str}")

    flags = summary.get("flags") or []
    if flags:
        print(f"    Flags set: {', '.join(flags)}")

    if summary.get("owner_type") is not None:
        print(f"    OwnerType -> {summary['owner_type']}")

    for note in summary.get("additional", []):
        print(f"    Additional: {note}")


def resolve_alias(args: argparse.Namespace) -> str:
    alias = args.alias
    if MULTIPLE_DATABASES:
        if alias:
            return alias
        aliases = list(MULTIPLE_DATABASES_MAP.keys())
        if len(aliases) == 1:
            return aliases[0]
        raise SystemExit(
            "Multiple databases configured. Specify an alias with --alias.\n"
            f"Available aliases: {', '.join(aliases)}"
        )
    return alias or ""


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    alias = resolve_alias(args)

    dbo = asm3.db.get_database(alias)
    if dbo.database in asm3.db.ERROR_VALUES:
        raise SystemExit(
            f"Unable to connect to database (alias: {alias or 'default'}). "
            "Check ASM3_DB* settings."
        )

    groups = fetch_duplicate_groups(dbo, owner_name_filter=args.name)
    if not groups:
        print(f"[alias: {alias or 'default'}] No duplicate owners found.")
        return 0

    total_processed = 0
    for name_key in groups:
        if args.limit is not None and total_processed >= args.limit:
            break
        rows = fetch_group_records(dbo, name_key)
        if not rows or len(rows) < 2:
            continue
        summary = process_group(dbo, name_key, rows, dry_run=args.dry_run)
        print_summary(alias or "default", summary, args.dry_run)
        total_processed += 1

    if args.limit is not None and total_processed >= args.limit and len(groups) > total_processed:
        print(
            f"[alias: {alias or 'default'}] Stopped after {total_processed} groups due to --limit={args.limit}."
        )

    if not args.dry_run:
        try:
            dbo.commit()
        except AttributeError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
