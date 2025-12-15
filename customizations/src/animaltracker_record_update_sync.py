"""
Sync Animal Tracker record details from ASM3 -> Animal Tracker.

Step 3 in the workflow:
1) (existing) register microchips on Animal Tracker (animaltracker_sync.py)
2) refresh the local micro table from Animal Tracker (animaltracker_records_sync.py)
3) compare ASM3 animals to micro table, and update Animal Tracker when name/DOB differ

This module matches animals to micro records by microchip number, then uses the
stored microchipID (GUID) to post updates to Animal Tracker.

Environment variables:
  ANIMALTRACKER_EMAIL / ANIMALTRACKER_PASSWORD

Optional:
  ANIMALTRACKER_DEBUG                - truthy string for verbose logging
  ANIMALTRACKER_DRY_RUN              - truthy string (no remote updates)
  ANIMALTRACKER_MICRO_TABLE          - table name (default: micro)
  ANIMALTRACKER_UPDATE_MAX_PER_RUN   - default: 250
  ANIMALTRACKER_UPDATE_THROTTLE_SECONDS - default: 1.0
  ANIMALTRACKER_UPDATE_ONLY_CHIP     - only process one microchip number
  ANIMALTRACKER_TARGET_DBNAME / ANIMALTRACKER_TARGET_DBALIAS - optional gating
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, List, Sequence, Tuple

import asm3.al
import asm3.lookups
import asm3.utils
from asm3.typehints import Database, ResultRow

import animaltracker_sync

UPDATE_URL = "https://www.animaltracker.co.uk/_account/record/update/"
LOGKEY = "animaltracker_update"


def _is_truthy_env(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on", "debug"}


def _log_info(dbo: Database, message: str) -> None:
    asm3.al.info(message, LOGKEY, dbo)


def _log_warn(dbo: Database, message: str) -> None:
    asm3.al.warn(message, LOGKEY, dbo)


def _log_error(dbo: Database, message: str, excinfo=None) -> None:
    asm3.al.error(message, LOGKEY, dbo, excinfo)


def _log_debug(dbo: Database, message: str, *, debug: bool) -> None:
    if debug:
        asm3.al.debug(message, LOGKEY, dbo)


def _validate_table_name(table_name: str) -> str:
    parts = [p for p in (table_name or "").split(".") if p]
    if not parts:
        raise ValueError("Missing table name")
    for part in parts:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
            raise ValueError(f"Unsafe table name {table_name!r}")
    return ".".join(parts)


def _quote_ident(dbo: Database, ident: str) -> str:
    if dbo.dbtype == "MYSQL":
        return "`" + ident.replace("`", "``") + "`"
    return '"' + ident.replace('"', '""') + '"'


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
        rows = dbo.query(
            "SELECT column_name AS col FROM information_schema.columns "
            "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
            [dbo.database, table_name.split(".", 1)[-1]],
        )
        return [str(r["COL"]) for r in rows]

    if dbo.dbtype == "SQLITE":
        rows = dbo.query(f"PRAGMA table_info({table_name})")
        return [str(r.get("NAME") or r.get("name")) for r in rows if (r.get("NAME") or r.get("name"))]

    rows = dbo.query(
        "SELECT column_name AS col FROM information_schema.columns "
        "WHERE table_name = ? ORDER BY ordinal_position",
        [table_name.split(".", 1)[-1]],
    )
    return [str(r["COL"]) for r in rows]


def _pick_column(columns_by_lower: Dict[str, str], candidates: Sequence[str]) -> str | None:
    for c in candidates:
        hit = columns_by_lower.get(c.lower())
        if hit:
            return hit
    return None


def _normalize_chip(value: str) -> str:
    return "".join(ch for ch in (value or "").strip() if ch.isdigit())


def _normalize_name(value: str) -> str:
    return " ".join((value or "").split()).strip().lower()


def _format_date_for_tracker(value: datetime | date | str | None) -> str:
    """
    Format as dd/mm/yyyy for Animal Tracker.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        v = value.strip()
        return v
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        dt = datetime.combine(value, datetime.min.time())
        return dt.strftime("%d/%m/%Y")
    raise ValueError(f"Unsupported date value: {value!r}")


def _sex_name(dbo: Database, sexid: int | None) -> str:
    if sexid is None:
        return "Unknown"
    name = (asm3.lookups.get_sex_name(dbo, sexid) or "").strip()
    lower = name.lower()
    if "female" in lower:
        return "Female"
    if "male" in lower:
        return "Male"
    return "Unknown"


def _breed_name(dbo: Database, breedid: int | None) -> str:
    if breedid is None:
        return ""
    return asm3.lookups.get_breed_name(dbo, breedid) or ""


@dataclass(frozen=True)
class MicroRow:
    microchip_no: str
    microchip_id: str
    name: str
    dob: str


def _load_micro_rows(dbo: Database, table_name: str) -> Dict[str, MicroRow]:
    table_name = _validate_table_name(table_name)
    cols = _get_table_columns(dbo, table_name)
    cols_by_lower = {c.lower(): c for c in cols}

    chip_col = _pick_column(
        cols_by_lower,
        [
            "microchipno",
            "microchip_no",
            "microchipnumber",
            "microchip",
            "microchip no",
            "microchip no.",
            "microchip number",
            "microchip number.",
        ],
    )
    id_col = _pick_column(cols_by_lower, ["microchipid", "microchip_id"])
    name_col = _pick_column(cols_by_lower, ["name", "animalname", "animal"])
    dob_col = _pick_column(cols_by_lower, ["dateofbirth", "date of birth", "dob", "date_of_birth"])

    if not chip_col:
        raise RuntimeError(f"Micro table {table_name!r} is missing a microchip number column; columns={cols}")
    if not id_col:
        raise RuntimeError(f"Micro table {table_name!r} is missing microchipid; add a microchipid column.")

    q_chip = _quote_ident(dbo, chip_col)
    q_id = _quote_ident(dbo, id_col)
    q_name = _quote_ident(dbo, name_col) if name_col else "''"
    q_dob = _quote_ident(dbo, dob_col) if dob_col else "''"

    sql = f"SELECT {q_chip} AS microchipno, {q_id} AS microchipid, {q_name} AS name, {q_dob} AS dob FROM {table_name}"
    rows = dbo.query(sql)

    out: Dict[str, MicroRow] = {}
    for r in rows:
        chip = _normalize_chip(asm3.utils.nulltostr(r.MICROCHIPNO))
        if not chip:
            continue
        if chip in out:
            continue
        out[chip] = MicroRow(
            microchip_no=chip,
            microchip_id=asm3.utils.nulltostr(r.MICROCHIPID).strip(),
            name=asm3.utils.nulltostr(r.NAME).strip(),
            dob=asm3.utils.nulltostr(r.DOB).strip(),
        )
    return out


def _animals_with_microchips(dbo: Database, *, only_chip: str | None) -> List[ResultRow]:
    sql = """
        SELECT a.ID AS ID,
               a.AnimalName AS ANIMALNAME,
               a.Sex AS SEX,
               a.BreedID AS BREEDID,
               a.Markings AS MARKINGS,
               a.IdentichipNumber AS IDENTICHIPNUMBER,
               a.DateOfBirth AS DATEOFBIRTH,
               a.DeceasedDate AS DECEASEDDATE
          FROM animal a
         WHERE 1=1
           AND a.Identichipped = 1
           AND a.IdentichipNumber IS NOT NULL
           AND TRIM(a.IdentichipNumber) <> ''
           AND a.DateOfBirth IS NOT NULL
           AND a.DeceasedDate IS NULL
    """
    params: List = []
    if only_chip:
        sql += " AND TRIM(a.IdentichipNumber) = ?"
        params.append(only_chip)
    sql += " ORDER BY a.ID DESC"
    return dbo.query(sql, params)


def update_record(
    session,
    *,
    microchip_id: str,
    animal_name: str,
    animal_breed: str,
    animal_gender: str,
    animal_dob: str,
    animal_colour: str,
    animal_description: str,
    debug: bool,
    dbo: Database,
) -> None:
    payload = {
        "animalName": animal_name,
        "animalBreed": animal_breed,
        "animalGender": animal_gender,
        "animalDOB": animal_dob,
        "animalColour": animal_colour,
        "animalDescription": animal_description,
        "submit3": "Save Changes",
    }

    resp = animaltracker_sync.post_with_debug(
        session,
        UPDATE_URL,
        params={"submit": "true", "microchipID": microchip_id},
        data=payload,
        context=f"Update record {microchip_id}",
        debug=debug,
        dbo=dbo,
    )

    lower = resp.text.lower()
    if "error" in lower and "save changes" in lower:
        detail = animaltracker_sync.extract_error_details(resp)
        raise RuntimeError(f"Update may have failed for {microchip_id}; {detail}")


def run(dbo: Database) -> None:
    debug = _is_truthy_env(os.getenv("ANIMALTRACKER_DEBUG"))
    dry_run = _is_truthy_env(os.getenv("ANIMALTRACKER_DRY_RUN"))
    table_name = (os.getenv("ANIMALTRACKER_MICRO_TABLE") or "micro").strip()

    max_per_run = int(os.getenv("ANIMALTRACKER_UPDATE_MAX_PER_RUN", "250") or "250")
    throttle = float(os.getenv("ANIMALTRACKER_UPDATE_THROTTLE_SECONDS", "1.0") or "1.0")
    only_chip = (os.getenv("ANIMALTRACKER_UPDATE_ONLY_CHIP") or "").strip()
    if only_chip:
        only_chip = _normalize_chip(only_chip)

    target_dbname = (os.getenv("ANIMALTRACKER_TARGET_DBNAME") or "").strip()
    target_dbalias = (os.getenv("ANIMALTRACKER_TARGET_DBALIAS") or "").strip()
    if target_dbname and dbo.name() != target_dbname:
        _log_info(dbo, f"Skipping Animal Tracker update for db={dbo.name()} (target dbname={target_dbname}).")
        return
    if target_dbalias and getattr(dbo, "alias", "") != target_dbalias:
        _log_info(dbo, f"Skipping Animal Tracker update for alias={getattr(dbo, 'alias', '')} (target alias={target_dbalias}).")
        return

    micro_by_chip = _load_micro_rows(dbo, table_name)
    if len(micro_by_chip) == 0:
        _log_info(dbo, f"No rows found in micro table {table_name!r}; nothing to update.")
        return

    animals = _animals_with_microchips(dbo, only_chip=only_chip or None)
    candidates: List[Tuple[ResultRow, MicroRow, bool, bool]] = []

    for a in animals:
        chip = _normalize_chip(asm3.utils.nulltostr(a.IDENTICHIPNUMBER))
        if not chip:
            continue
        m = micro_by_chip.get(chip)
        if not m:
            continue
        if not m.microchip_id:
            continue

        local_name = asm3.utils.nulltostr(a.ANIMALNAME).strip()
        local_dob = _format_date_for_tracker(getattr(a, "DATEOFBIRTH", None))
        remote_name = m.name
        remote_dob = m.dob

        name_diff = _normalize_name(local_name) != _normalize_name(remote_name)
        dob_diff = (local_dob or "").strip() != (remote_dob or "").strip()
        if name_diff or dob_diff:
            candidates.append((a, m, name_diff, dob_diff))

    if only_chip:
        _log_info(dbo, f"Animal Tracker update: checking chip={only_chip}; mismatches={len(candidates)}.")
    else:
        _log_info(dbo, f"Animal Tracker update: mismatches={len(candidates)} (micro table={table_name!r}).")

    if len(candidates) == 0:
        return

    if max_per_run > 0:
        candidates = candidates[:max_per_run]

    if dry_run:
        for a, m, name_diff, dob_diff in candidates:
            _log_info(
                dbo,
                f"DRY RUN: Would update {m.microchip_id} chip={m.microchip_no} (animal {a.ID}) "
                f"name_diff={name_diff} dob_diff={dob_diff}",
            )
        return

    email, password = animaltracker_sync.get_credentials()
    session = animaltracker_sync.login(email, password, debug=debug, dbo=dbo)

    for idx, (a, m, name_diff, dob_diff) in enumerate(candidates, start=1):
        local_name = asm3.utils.nulltostr(a.ANIMALNAME).strip()
        local_dob = _format_date_for_tracker(getattr(a, "DATEOFBIRTH", None))
        gender = _sex_name(dbo, getattr(a, "SEX", None))
        breed = _breed_name(dbo, getattr(a, "BREEDID", None))
        markings = asm3.utils.nulltostr(getattr(a, "MARKINGS", "")).strip()

        _log_info(
            dbo,
            f"[{idx}/{len(candidates)}] Updating Animal Tracker record {m.microchip_id} chip={m.microchip_no} "
            f"(animal {a.ID}) name_diff={name_diff} dob_diff={dob_diff}",
        )
        _log_debug(
            dbo,
            f"[DEBUG] Local vs remote: name={local_name!r}/{m.name!r} dob={local_dob!r}/{m.dob!r}",
            debug=debug,
        )

        try:
            update_record(
                session,
                microchip_id=m.microchip_id,
                animal_name=local_name,
                animal_breed=breed,
                animal_gender=gender,
                animal_dob=local_dob,
                animal_colour="Brown",
                animal_description=markings,
                debug=debug,
                dbo=dbo,
            )
        except Exception as err:  # pragma: no cover - network
            _log_error(dbo, f"Failed updating record {m.microchip_id} chip={m.microchip_no}: {err}")
            continue

        if throttle:
            time.sleep(throttle)

