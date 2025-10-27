import asm3.al
import asm3.utils

from asm3.typehints import Database, Dict, List

TABLE_NAME = "custom_useranimalaccess"
_TABLE_CACHE: Dict[str, bool] = {}


def _cache_key(dbo: Database) -> str:
    """
    Build a cache key for the supplied database object so we can memoise
    whether the access table exists without issuing extra queries per request.
    """
    name = getattr(dbo, "database", None) or ""
    alias = getattr(dbo, "alias", None) or ""
    return f"{dbo.dbtype}:{alias}:{name}"


def table_exists(dbo: Database) -> bool:
    """
    Returns True if the custom access table exists in this database.
    The result is cached per database connection to avoid repeated probes.
    On error we assume the table is missing.
    """
    key = _cache_key(dbo)
    if key in _TABLE_CACHE:
        return _TABLE_CACHE[key]
    try:
        # Probe with a lightweight query; this works across supported DB backends.
        dbo.query(f"SELECT 1 FROM {TABLE_NAME} WHERE 1=0")
        _TABLE_CACHE[key] = True
    except Exception:
        _TABLE_CACHE[key] = False
    return _TABLE_CACHE[key]


def refresh_cache(dbo: Database) -> None:
    """
    Clears the cached table-existence flag for the supplied database.
    Call this after creating or dropping the table out-of-band.
    """
    key = _cache_key(dbo)
    if key in _TABLE_CACHE:
        del _TABLE_CACHE[key]


def get_user_access_ids(
    dbo: Database,
    user_id: int,
    access_types: List[str] = None,
) -> Dict[int, str]:
    """
    Returns a mapping of AnimalID -> AccessType for entries recorded for the user.
    If access_types is provided, the result is filtered to those values.
    Missing tables or query errors are logged and treated as no access.
    """
    results: Dict[int, str] = {}
    if not user_id:
        return results
    if not table_exists(dbo):
        return results

    sql = f"SELECT AnimalID, AccessType FROM {TABLE_NAME} WHERE UserID=?"
    params: List = [user_id]
    if access_types:
        placeholders = ",".join("?" for _ in access_types)
        sql = f"{sql} AND AccessType IN ({placeholders})"
        params.extend(access_types)

    try:
        rows = dbo.query(sql, params)
    except Exception as err:
        asm3.al.warn(
            f"custom access lookup failed for user {user_id}: {err}",
            "useranimalaccess.get_user_access_ids",
            dbo,
        )
        return results

    for r in rows:
        animal_id = asm3.utils.cint(getattr(r, "ANIMALID", None))
        if not animal_id:
            continue
        access_type = asm3.utils.nulltostr(getattr(r, "ACCESSTYPE", None))
        results[animal_id] = access_type
    return results


def has_access(dbo: Database, user_id: int, animal_id: int, access_type: str = None) -> bool:
    """
    Returns True if there is an access row for the supplied combination.
    Optional access_type restricts the match to a specific type.
    """
    if not animal_id or not user_id:
        return False
    rows = get_user_access_ids(dbo, user_id, [access_type] if access_type else None)
    return animal_id in rows


def is_write_allowed(session, animal_id: int) -> bool:
    """
    Checks whether the current session allows write access to the supplied animal.
    Weight gainer sessions store their active foster list in
    session.weightgainer_activeanimalids; all other sessions are unrestricted here.
    """
    if animal_id <= 0:
        return False
    if not hasattr(session, "roles"):
        return True

    # Only weight gainer sessions carry the additional restrictions enforced here.
    roles_raw = asm3.utils.nulltostr(getattr(session, "roles", ""))
    if "weight gainer" not in roles_raw.lower():
        return True

    active_ids_raw = asm3.utils.nulltostr(getattr(session, "weightgainer_activeanimalids", ""))
    if not active_ids_raw:
        return False
    active_ids = {part.strip() for part in active_ids_raw.split(",") if part.strip()}
    return str(animal_id) in active_ids
