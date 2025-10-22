"""Utility helpers for managing the curated pool of random animal names."""

import csv
import io
import random

import asm3.utils

from asm3.i18n import _
from asm3.typehints import Database, Dict, List, ResultRow

TABLE = "animalname"

SEX_FEMALE = 0
SEX_MALE = 1
SEX_UNKNOWN = 2


def _normalise_name(name: str) -> str:
    if name is None:
        return ""
    return name.strip()


def _normalise_sex(sex: int) -> int:
    if sex in (SEX_FEMALE, SEX_MALE, SEX_UNKNOWN):
        return sex
    # Treat any unexpected values as unknown so the record remains usable.
    return SEX_UNKNOWN


def get_all(dbo: Database) -> List[ResultRow]:
    """Return all curated names ordered alphabetically."""
    return dbo.query(f"SELECT ID, Name, Sex FROM {TABLE} ORDER BY LOWER(Name)")


def _exists(dbo: Database, name: str, exclude_id: int = 0) -> bool:
    sql = f"SELECT COUNT(*) FROM {TABLE} WHERE LOWER(Name) = LOWER(?)"
    params: List = [name]
    if exclude_id:
        sql += " AND ID <> ?"
        params.append(exclude_id)
    return dbo.query_int(sql, params) > 0


def insert(dbo: Database, username: str, name: str, sex: int) -> int:
    """Insert a new curated name. Raises ASMValidationError on duplicates."""
    lname = _normalise_name(name)
    if lname == "":
        raise asm3.utils.ASMValidationError(_("Name cannot be blank", dbo.locale))
    sex_value = _normalise_sex(sex)
    if _exists(dbo, lname):
        raise asm3.utils.ASMValidationError(_("Name '{0}' already exists in the pool.", dbo.locale).format(lname))
    return dbo.insert(TABLE, {
        "Name": lname,
        "Sex": sex_value
    }, username, setCreated=False)


def update(dbo: Database, username: str, row_id: int, name: str, sex: int) -> None:
    lname = _normalise_name(name)
    if lname == "":
        raise asm3.utils.ASMValidationError(_("Name cannot be blank", dbo.locale))
    sex_value = _normalise_sex(sex)
    if _exists(dbo, lname, exclude_id=row_id):
        raise asm3.utils.ASMValidationError(_("Name '{0}' already exists in the pool.", dbo.locale).format(lname))
    dbo.update(TABLE, row_id, { "Name": lname, "Sex": sex_value }, username, setChanged=False)


def delete_many(dbo: Database, username: str, ids: List[int]) -> None:
    if not ids:
        return
    placeholders = ",".join(["?"] * len(ids))
    dbo.execute(f"DELETE FROM {TABLE} WHERE ID IN ({placeholders})", ids)


def available_names(dbo: Database, sex: int) -> List[str]:
    """Return curated names filtered for the requested sex and excluding used ones."""
    params: List = []
    wheresex = ""
    if sex in (SEX_FEMALE, SEX_MALE):
        wheresex = " AND n.Sex IN (?, ?)"
        params.extend([sex, SEX_UNKNOWN])
    elif sex == SEX_UNKNOWN:
        wheresex = " AND n.Sex = ?"
        params.append(SEX_UNKNOWN)
    rows = dbo.query(
        "SELECT n.Name AS NAME "
        "FROM animalname n "
        "WHERE NOT EXISTS ("
        "    SELECT 1 FROM animal a WHERE LOWER(a.AnimalName) = LOWER(n.Name)"
        ")" + wheresex,
        params
    )
    return [r["NAME"] for r in rows if r["NAME"]]


def pick_random_name(dbo: Database, sex: int) -> str:
    names = available_names(dbo, sex)
    if not names:
        return ""
    return random.choice(names)


_SEX_LABEL_MAP: Dict[str, int] = {
    "female": SEX_FEMALE,
    "f": SEX_FEMALE,
    "0": SEX_FEMALE,
    "male": SEX_MALE,
    "m": SEX_MALE,
    "1": SEX_MALE,
    "unknown": SEX_UNKNOWN,
    "either": SEX_UNKNOWN,
    "both": SEX_UNKNOWN,
    "any": SEX_UNKNOWN,
    "u": SEX_UNKNOWN,
    "2": SEX_UNKNOWN
}


def _parse_csv_row(row: Dict[str, str], default_locale: str) -> Dict[str, str]:
    if not row:
        raise asm3.utils.ASMValidationError(_("CSV row is empty", default_locale))
    keys: Dict[str, str] = {}
    for key, value in row.items():
        if key is None:
            continue
        normalised = key.lower().strip().replace("\ufeff", "")
        keys[normalised] = value
    if "animalname" not in keys and "name" not in keys:
        raise asm3.utils.ASMValidationError(_("CSV is missing an 'animalname' column", default_locale))
    sex_value = keys.get("sex", "").strip().lower()
    if sex_value == "":
        raise asm3.utils.ASMValidationError(_("CSV row is missing a sex value", default_locale))
    if sex_value not in _SEX_LABEL_MAP:
        raise asm3.utils.ASMValidationError(_("Sex value '{0}' is not recognised. Use male, female or unknown.", default_locale).format(sex_value))
    name_value = keys.get("animalname") or keys.get("name") or ""
    name_value = name_value.strip()
    if name_value == "":
        raise asm3.utils.ASMValidationError(_("CSV row is missing a name", default_locale))
    return {
        "name": name_value,
        "sex": _SEX_LABEL_MAP[sex_value]
    }


def import_csv(dbo: Database, username: str, csv_text: str) -> Dict[str, object]:
    """Bulk import names from CSV text. Returns summary info."""
    if csv_text is None:
        raise asm3.utils.ASMValidationError(_("No CSV data supplied", dbo.locale))
    data = csv_text.strip()
    if data == "":
        raise asm3.utils.ASMValidationError(_("No CSV data supplied", dbo.locale))

    added = 0
    skipped = 0
    errors: List[str] = []
    new_rows: List[ResultRow] = []

    stream = io.StringIO(data)
    reader = csv.DictReader(stream)
    if reader.fieldnames is None:
        raise asm3.utils.ASMValidationError(_("CSV header is missing", dbo.locale))

    for line_number, row in enumerate(reader, start=2):
        try:
            parsed = _parse_csv_row(row, dbo.locale)
            name = parsed["name"]
            sex = parsed["sex"]
            if _exists(dbo, name):
                skipped += 1
                continue
            new_id = insert(dbo, username, name, sex)
            added += 1
            new_rows.extend(dbo.query("SELECT ID, Name, Sex FROM %s WHERE ID = ?" % TABLE, [new_id]))
        except asm3.utils.ASMValidationError as err:
            errors.append(_("Line {0}: {1}", dbo.locale).format(line_number, str(err)))
        except Exception as err: # Catch any unexpected parse errors but continue processing
            errors.append(_("Line {0}: {1}", dbo.locale).format(line_number, str(err)))
    return {
        "added": added,
        "skipped": skipped,
        "errors": errors,
        "rows": new_rows
    }
