"""
Fetch Animal Tracker "View Records" list and sync to a local database table.

This module:
1) logs into Animal Tracker using ANIMALTRACKER_EMAIL / ANIMALTRACKER_PASSWORD,
2) calls the "get-records.asp" endpoint (HTML response),
3) parses the returned HTML table rows (including microchipID GUID),
4) truncates and repopulates a local "micro" table (name configurable).

Environment variables:
  ANIMALTRACKER_EMAIL / ANIMALTRACKER_PASSWORD

Optional tuning:
  ANIMALTRACKER_DEBUG              - truthy string for verbose logging
  ANIMALTRACKER_DRY_RUN            - truthy string to fetch/parse only (no DB writes)

  ANIMALTRACKER_MICRO_TABLE        - destination table name (default: micro)
  ANIMALTRACKER_RECORDS_ALLOW_EMPTY - truthy string to allow truncating to empty set

  ANIMALTRACKER_RECORDS_SORTBY     - payload sortby (default: microchipno ASC)
  ANIMALTRACKER_RECORDS_TYPE       - payload type (default: empty)
  ANIMALTRACKER_RECORDS_MICROCHIPNO - payload microchipno (default: empty)
  ANIMALTRACKER_RECORDS_ANIMALNAME - payload animalname (default: empty)
  ANIMALTRACKER_RECORDS_SPECIES    - payload species (default: empty)
  ANIMALTRACKER_RECORDS_DOB1/DOB2  - payload dob1/dob2 (default: empty)
  ANIMALTRACKER_RECORDS_IMPLANTED1/IMPLANTED2 - payload implanted1/implanted2 (default: empty)
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Sequence, Tuple

import asm3.al
from asm3.typehints import Database

import animaltracker_sync
from animaltracker_records_parser import AnimalTrackerRecord, parse_records_html

RECORDS_URL = "https://www.animaltracker.co.uk/_account/view-records/ajax/get-records.asp"
LOGKEY = "animaltracker_records"


def _is_truthy_env(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on", "debug"}


def _log_info(dbo: Database, message: str) -> None:
    asm3.al.info(message, LOGKEY, dbo)


def _log_warn(dbo: Database, message: str) -> None:
    asm3.al.warn(message, LOGKEY, dbo)


def _log_debug(dbo: Database, message: str, *, debug: bool) -> None:
    if debug:
        asm3.al.debug(message, LOGKEY, dbo)


def _cachebuster_date_param() -> str:
    # Match JS Date.toString() style observed in browser requests.
    # Example: "Sun Dec 14 2025 21:47:40 GMT+0000 (Greenwich Mean Time)"
    now = datetime.now(timezone.utc)
    return now.strftime("%a %b %d %Y %H:%M:%S GMT+0000 (Greenwich Mean Time)")


def fetch_records_html(session, *, payload: Dict[str, str], debug: bool, dbo: Database) -> str:
    resp = animaltracker_sync.post_with_debug(
        session,
        RECORDS_URL,
        params={"d": _cachebuster_date_param()},
        data=payload,
        context="Fetch Animal Tracker records",
        debug=debug,
        dbo=dbo,
    )
    return resp.text


def _validate_table_name(table_name: str) -> str:
    # Keep this strict to avoid SQL injection via env vars.
    # Allow schema-qualified names like "public.micro".
    parts = [p for p in (table_name or "").split(".") if p]
    if not parts:
        raise ValueError("Missing table name")
    for part in parts:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
            raise ValueError(f"Unsafe table name {table_name!r}")
    return ".".join(parts)


def _get_table_columns(dbo: Database, table_name: str) -> List[str]:
    if dbo.dbtype == "POSTGRESQL":
        if "." in table_name:
            schema, table = table_name.split(".", 1)
        else:
            schema, table = "public", table_name
        rows = dbo.query(
            "SELECT column_name AS col FROM information_schema.columns "
            "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
            [schema, table],
        )
        return [str(r["COL"]) for r in rows]

    if dbo.dbtype == "MYSQL":
        # Use current database name as schema.
        rows = dbo.query(
            "SELECT column_name AS col FROM information_schema.columns "
            "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
            [dbo.database, table_name.split(".", 1)[-1]],
        )
        return [str(r["COL"]) for r in rows]

    if dbo.dbtype == "SQLITE":
        rows = dbo.query(f"PRAGMA table_info({table_name})")
        # SQLite pragma returns: cid, name, type, notnull, dflt_value, pk
        return [str(r.get("NAME") or r.get("name")) for r in rows if (r.get("NAME") or r.get("name"))]

    # Best-effort fallback: try information_schema without schema qualifier.
    rows = dbo.query(
        "SELECT column_name AS col FROM information_schema.columns "
        "WHERE table_name = ? ORDER BY ordinal_position",
        [table_name.split(".", 1)[-1]],
    )
    return [str(r["COL"]) for r in rows]


def _get_table_column_max_lengths(dbo: Database, table_name: str) -> Dict[str, int | None]:
    """
    Return mapping of column_name(lowercased) -> max character length (or None if unbounded/unknown).
    """
    if dbo.dbtype == "POSTGRESQL":
        if "." in table_name:
            schema, table = table_name.split(".", 1)
        else:
            schema, table = "public", table_name
        rows = dbo.query(
            "SELECT column_name AS col, character_maximum_length AS maxlen "
            "FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [schema, table],
        )
        out: Dict[str, int | None] = {}
        for r in rows:
            col = str(r["COL"])
            maxlen = r.get("MAXLEN")
            out[col.lower()] = int(maxlen) if maxlen is not None else None
        return out

    if dbo.dbtype == "MYSQL":
        rows = dbo.query(
            "SELECT column_name AS col, character_maximum_length AS maxlen "
            "FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [dbo.database, table_name.split(".", 1)[-1]],
        )
        out: Dict[str, int | None] = {}
        for r in rows:
            col = str(r["COL"])
            maxlen = r.get("MAXLEN")
            out[col.lower()] = int(maxlen) if maxlen is not None else None
        return out

    if dbo.dbtype == "SQLITE":
        # PRAGMA table_info provides type strings, sometimes including VARCHAR(N).
        rows = dbo.query(f"PRAGMA table_info({table_name})")
        out: Dict[str, int | None] = {}
        for r in rows:
            name = str(r.get("NAME") or r.get("name") or "")
            typ = str(r.get("TYPE") or r.get("type") or "")
            maxlen = None
            match = re.search(r"\b(?:varchar|character varying|char)\s*\(\s*(\d+)\s*\)", typ, re.IGNORECASE)
            if match:
                maxlen = int(match.group(1))
            if name:
                out[name.lower()] = maxlen
        return out

    return {}


def _truncate_table(dbo: Database, table_name: str) -> None:
    if dbo.dbtype == "POSTGRESQL":
        dbo.execute(f"TRUNCATE TABLE {table_name}")
        return
    dbo.execute(f"DELETE FROM {table_name}")


def sync_micro_table(
    dbo: Database,
    *,
    table_name: str,
    records: Sequence[AnimalTrackerRecord],
    debug: bool,
    allow_empty: bool,
) -> None:
    table_name = _validate_table_name(table_name)
    columns = _get_table_columns(dbo, table_name)
    if not columns:
        raise RuntimeError(f"Could not read columns for table {table_name!r}.")

    columns_by_lower = {c.lower(): c for c in columns}
    max_lengths = _get_table_column_max_lengths(dbo, table_name)

    def quote_column(col: str) -> str:
        # Columns may include spaces/case (eg "Microchip No"), so always quote.
        if dbo.dbtype == "MYSQL":
            return "`" + col.replace("`", "``") + "`"
        return '"' + col.replace('"', '""') + '"'

    field_candidates: List[Tuple[str, List[str]]] = [
        (
            "microchip_no",
            [
                "microchipno",
                "microchip_no",
                "microchipnumber",
                "microchip",
                "identichipnumber",
                "microchip no",
                "microchip number",
                "microchip no.",
                "microchip number.",
            ],
        ),
        ("microchip_id", ["microchipid", "microchip_id"]),
        ("name", ["name", "animalname", "animal"]),
        ("species", ["species", "animaltype", "animal type"]),
        ("breed", ["breed"]),
        ("date_of_birth", ["dateofbirth", "date_of_birth", "dob", "date of birth"]),
        ("implant_date", ["implantdate", "implant_date", "implanted", "microchipdate", "identichipdate", "implant date"]),
        ("view_record", ["column7", "view_record", "viewrecord", "recordlink", "record_url", "url"]),
    ]

    target_cols: List[Tuple[str, str]] = []
    for field, candidates in field_candidates:
        actual = None
        for candidate in candidates:
            actual = columns_by_lower.get(candidate.lower())
            if actual:
                break
        if actual:
            target_cols.append((field, actual))

    if not any(field == "microchip_no" for field, _ in target_cols):
        raise RuntimeError(
            f"Table {table_name!r} does not appear to have a microchip number column; "
            f"available columns: {columns}"
        )

    if len(records) == 0 and not allow_empty:
        raise RuntimeError(
            "Parsed 0 Animal Tracker records; refusing to truncate destination table. "
            "Set ANIMALTRACKER_RECORDS_ALLOW_EMPTY=1 to allow truncating to an empty set."
        )

    _log_info(dbo, f"Syncing {len(records)} Animal Tracker record(s) into {table_name}...")
    _log_debug(dbo, f"Using columns: {target_cols}", debug=debug)

    _truncate_table(dbo, table_name)
    if len(records) == 0:
        _log_warn(dbo, f"Destination table {table_name} truncated; no records inserted.")
        return

    insert_cols = [quote_column(col) for _, col in target_cols]
    placeholders = ", ".join(["?"] * len(insert_cols))
    col_list = ", ".join(insert_cols)
    sql = f"INSERT INTO {table_name} ({col_list}) VALUES ({placeholders})"

    def view_record_value(_r: AnimalTrackerRecord) -> str:
        # Keep this short to fit existing legacy schemas (often VARCHAR(50)).
        return "View Record"

    def maybe_truncate(col_name: str, value: str) -> str:
        maxlen = max_lengths.get((col_name or "").lower())
        if maxlen is None:
            return value
        if len(value) <= maxlen:
            return value
        return value[:maxlen]

    def row_values(r: AnimalTrackerRecord) -> Tuple[str, ...]:
        values: List[str] = []
        for field, _col in target_cols:
            if field == "view_record":
                values.append(maybe_truncate(_col, view_record_value(r)))
            else:
                values.append(maybe_truncate(_col, getattr(r, field) or ""))
        return tuple(values)

    dbo.execute_many(sql, [row_values(r) for r in records])


def run(dbo: Database) -> None:
    debug = _is_truthy_env(os.getenv("ANIMALTRACKER_DEBUG"))
    dry_run = _is_truthy_env(os.getenv("ANIMALTRACKER_DRY_RUN"))

    target_dbname = (os.getenv("ANIMALTRACKER_TARGET_DBNAME") or "").strip()
    target_dbalias = (os.getenv("ANIMALTRACKER_TARGET_DBALIAS") or "").strip()
    if target_dbname and dbo.name() != target_dbname:
        _log_info(dbo, f"Skipping Animal Tracker records sync for db={dbo.name()} (target dbname={target_dbname}).")
        return
    if target_dbalias and getattr(dbo, "alias", "") != target_dbalias:
        _log_info(
            dbo,
            f"Skipping Animal Tracker records sync for alias={getattr(dbo, 'alias', '')} (target alias={target_dbalias}).",
        )
        return

    table_name = (os.getenv("ANIMALTRACKER_MICRO_TABLE") or "micro").strip()
    allow_empty = _is_truthy_env(os.getenv("ANIMALTRACKER_RECORDS_ALLOW_EMPTY"))

    payload = {
        "microchipno": (os.getenv("ANIMALTRACKER_RECORDS_MICROCHIPNO") or "").strip(),
        "animalname": (os.getenv("ANIMALTRACKER_RECORDS_ANIMALNAME") or "").strip(),
        "species": (os.getenv("ANIMALTRACKER_RECORDS_SPECIES") or "").strip(),
        "dob1": (os.getenv("ANIMALTRACKER_RECORDS_DOB1") or "").strip(),
        "dob2": (os.getenv("ANIMALTRACKER_RECORDS_DOB2") or "").strip(),
        "implanted1": (os.getenv("ANIMALTRACKER_RECORDS_IMPLANTED1") or "").strip(),
        "implanted2": (os.getenv("ANIMALTRACKER_RECORDS_IMPLANTED2") or "").strip(),
        "sortby": (os.getenv("ANIMALTRACKER_RECORDS_SORTBY") or "microchipno ASC").strip(),
        "type": (os.getenv("ANIMALTRACKER_RECORDS_TYPE") or "").strip(),
    }

    email, password = animaltracker_sync.get_credentials()
    session = animaltracker_sync.login(email, password, debug=debug, dbo=dbo)
    html = fetch_records_html(session, payload=payload, debug=debug, dbo=dbo)
    records = parse_records_html(html)

    if debug and records:
        sample = records[0]
        _log_debug(
            dbo,
            f"Sample parsed record: microchip_no={sample.microchip_no} microchip_id={sample.microchip_id} name={sample.name}",
            debug=debug,
        )

    if dry_run:
        _log_info(dbo, f"DRY RUN: fetched {len(records)} record(s); no database changes.")
        return

    sync_micro_table(dbo, table_name=table_name, records=records, debug=debug, allow_empty=allow_empty)
