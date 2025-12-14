"""
Automated Animal Tracker registration for recently changed animals.

This module is loaded by cron (see src/cron.py) and:
1) finds animals changed within the last N days that have a microchip,
2) checks whether the chip already appears on Animal Tracker via the existing
   microchip lookup service,
3) registers the chip on Animal Tracker when it is not found,
4) marks the animal as published to avoid repeat attempts.

Credentials must be provided via environment:
    ANIMALTRACKER_EMAIL
    ANIMALTRACKER_PASSWORD

Optional environment tuning:
    ANIMALTRACKER_LOOKBACK_DAYS (default: 0, disabled)
    ANIMALTRACKER_DEBUG (truthy string for verbose HTTP logging)
    ANIMALTRACKER_THROTTLE_SECONDS (default: 1.0 between registrations)
    ANIMALTRACKER_HTTP_TIMEOUT (default: 20 seconds)
    ANIMALTRACKER_DRY_RUN (truthy string to log-only, no changes)
    ANIMALTRACKER_ANIMALNAME (exact name to sync a single animal)
    ANIMALTRACKER_MAX_PER_RUN (default: 250)
    ANIMALTRACKER_TARGET_DBNAME (only run when dbo.name() matches)
    ANIMALTRACKER_TARGET_DBALIAS (only run when dbo.alias matches, map mode)
"""

from __future__ import annotations

import os
import re
import time
from datetime import date, datetime
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, unquote, urlparse

import requests

import asm3.al
import asm3.lookups
import asm3.utils
from asm3.typehints import Database, ResultRow

# ----------------- CONFIG -----------------

LOGIN_URL = "https://www.animaltracker.co.uk/_login/?send=true&rt=&tc=&mc=&msg=&route="
REGISTER_CHIP_URL = "https://www.animaltracker.co.uk/_account/register/"
REGISTER_ANIMAL_URL = "https://www.animaltracker.co.uk/_account/register/animal/"

LOOKBACK_DAYS = int(os.getenv("ANIMALTRACKER_LOOKBACK_DAYS", "0") or "0")
SLEEP_BETWEEN = float(os.getenv("ANIMALTRACKER_THROTTLE_SECONDS", "1.0") or "1.0")
# Total read timeout (seconds) for Animal Tracker HTTP calls.
HTTP_TIMEOUT = float(os.getenv("ANIMALTRACKER_HTTP_TIMEOUT", "20") or "20")
# How many times to retry transient HTTP failures (timeouts/connection errors).
HTTP_RETRIES = int(os.getenv("ANIMALTRACKER_HTTP_RETRIES", "2") or "2")
# Seconds to sleep between retries (will be multiplied by attempt number).
HTTP_RETRY_SLEEP = float(os.getenv("ANIMALTRACKER_HTTP_RETRY_SLEEP", "2.0") or "2.0")
MAX_PER_RUN = int(os.getenv("ANIMALTRACKER_MAX_PER_RUN", "250") or "250")
DEBUG_SNIPPET_LEN = 1200
PUBLISHED_TO = "animaltracker"
LOGKEY = "animaltracker_sync"


class MicrochipAlreadyRegistered(RuntimeError):
    """Raised when the site reports the microchip is already registered."""


def _log_debug(dbo: Database, message: str) -> None:
    asm3.al.debug(message, LOGKEY, dbo)


def _log_info(dbo: Database, message: str) -> None:
    asm3.al.info(message, LOGKEY, dbo)


def _log_warn(dbo: Database, message: str) -> None:
    asm3.al.warn(message, LOGKEY, dbo)


def _log_error(dbo: Database, message: str, excinfo: Any | None = None) -> None:
    asm3.al.error(message, LOGKEY, dbo, excinfo)


# ----------------- HTTP HELPERS -----------------

def extract_error_details(resp: requests.Response, max_len: int = 800) -> str:
    """
    Pull out likely error lines from the response to aid debugging.
    """
    markers = ("error", "problem", "warning", "invalid", "required", "please")
    ignore_markers = ("livechatwidget", "tracking.js", "cdn.livechatinc.com")
    lines = []

    for line in resp.text.splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if not stripped:
            continue
        if any(ignore in lower for ignore in ignore_markers):
            continue
        if any(marker in lower for marker in markers):
            lines.append(stripped)
        if len(lines) >= 6:
            break

    detail_source = " | ".join(lines) if lines else " ".join(resp.text.split())
    detail = detail_source[:max_len]

    return f"status={resp.status_code} url={resp.url} details={detail}"


def summarize_text(text: str, max_len: int = 200) -> str:
    """
    Flatten whitespace and truncate for concise logging.
    """
    return " ".join(text.split())[:max_len]


def raise_for_status_with_detail(resp: requests.Response, context: str) -> None:
    """
    Wrap raise_for_status with context and response snippet.
    """
    try:
        resp.raise_for_status()
    except requests.HTTPError as exc:
        detail = extract_error_details(resp)
        raise RuntimeError(f"{context} failed; {detail}") from exc


def redact_data_for_debug(data: Dict[str, str] | None) -> Dict[str, str]:
    """
    Avoid printing sensitive fields in debug logs.
    """
    if not data:
        return {}

    redacted_keys = {"password"}
    sanitized = {}

    for key, value in data.items():
        sanitized[key] = "***" if key in redacted_keys else value

    return sanitized


def post_with_debug(
    session: requests.Session,
    url: str,
    *,
    params: Dict[str, str] | None,
    data: Dict[str, str] | None,
    context: str,
    debug: bool,
    dbo: Database,
) -> requests.Response:
    """
    Perform a POST request with optional debug output and standard error handling.
    """
    if debug:
        _log_debug(dbo, f"[DEBUG] POST {url} params={params or {}} data={redact_data_for_debug(data)}")

    timeout = (10.0, float(HTTP_TIMEOUT))
    attempts = max(1, int(HTTP_RETRIES) + 1)
    for attempt in range(1, attempts + 1):
        try:
            if debug and attempt > 1:
                _log_debug(dbo, f"[DEBUG] Retry {attempt}/{attempts} for {context}")
            resp = session.post(url, params=params, data=data, timeout=timeout)
            break
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as err:
            if debug:
                _log_debug(
                    dbo,
                    f"[DEBUG] {context} transient error ({type(err).__name__}): {err}",
                )
            if attempt >= attempts:
                raise RuntimeError(f"{context} failed after {attempts} attempt(s): {err}") from err
            time.sleep(HTTP_RETRY_SLEEP * attempt)

    if debug:
        snippet = resp.text[:DEBUG_SNIPPET_LEN].replace("\n", "\\n")
        _log_debug(dbo, f"[DEBUG] {context} status={resp.status_code} url={resp.url}")
        _log_debug(dbo, f"[DEBUG] {context} response snippet: {snippet}")

    raise_for_status_with_detail(resp, context)
    return resp


def get_with_debug(
    session: requests.Session,
    url: str,
    *,
    params: Dict[str, str] | None,
    context: str,
    debug: bool,
    dbo: Database,
    allow_error: bool = False,
) -> requests.Response:
    """
    Perform a GET request with optional debug output and standard error handling.
    """
    if debug:
        _log_debug(dbo, f"[DEBUG] GET  {url} params={params or {}}")

    timeout = (10.0, float(HTTP_TIMEOUT))
    attempts = max(1, int(HTTP_RETRIES) + 1)
    for attempt in range(1, attempts + 1):
        try:
            if debug and attempt > 1:
                _log_debug(dbo, f"[DEBUG] Retry {attempt}/{attempts} for {context}")
            resp = session.get(url, params=params, timeout=timeout)
            break
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as err:
            if debug:
                _log_debug(
                    dbo,
                    f"[DEBUG] {context} transient error ({type(err).__name__}): {err}",
                )
            if attempt >= attempts:
                raise RuntimeError(f"{context} failed after {attempts} attempt(s): {err}") from err
            time.sleep(HTTP_RETRY_SLEEP * attempt)

    if debug:
        snippet = resp.text[:DEBUG_SNIPPET_LEN].replace("\n", "\\n")
        _log_debug(dbo, f"[DEBUG] {context} status={resp.status_code} url={resp.url}")
        _log_debug(dbo, f"[DEBUG] {context} response snippet: {snippet}")

    if not allow_error:
        raise_for_status_with_detail(resp, context)
    return resp


def page_contains_error(resp: requests.Response) -> bool:
    """
    Check for error indicators in the page body (ignoring scripts).
    """
    if "There was a problem" in resp.text:
        return True

    text_no_scripts = re.sub(r"<script.*?</script>", "", resp.text, flags=re.DOTALL | re.IGNORECASE)
    return "error" in text_no_scripts.lower()


def extract_microchip_identifier(resp: requests.Response) -> str | None:
    """
    Try to pull a microchip identifier (GUID or number) from URL or response body.
    """
    parsed = urlparse(resp.url)
    qs = parse_qs(parsed.query)
    for key in ("microchipID", "microchipid", "microchip"):
        vals = qs.get(key)
        if vals:
            return unquote(vals[0])

    body = resp.text
    match = re.search(r"microchipID=({?[A-Za-z0-9-]+}?)", body, re.IGNORECASE)
    if match:
        return unquote(match.group(1))

    return None


# ----------------- ANIMAL TRACKER API -----------------

def get_credentials() -> Tuple[str, str]:
    """
    Fetch Animal Tracker credentials from environment variables.
    """
    email = os.getenv("ANIMALTRACKER_EMAIL")
    password = os.getenv("ANIMALTRACKER_PASSWORD")

    if not email or not password:
        raise RuntimeError(
            "Missing credentials. Set ANIMALTRACKER_EMAIL and ANIMALTRACKER_PASSWORD in the environment."
        )

    return email, password


def login(email: str, password: str, *, debug: bool, dbo: Database) -> requests.Session:
    """
    Log in to Animal Tracker and return an authenticated requests.Session.
    """
    session = requests.Session()

    payload = {
        "email": email,
        "password": password,
        "loginsubmit": "Login",
    }

    resp = post_with_debug(
        session,
        LOGIN_URL,
        params=None,
        data=payload,
        context="Login",
        debug=debug,
        dbo=dbo,
    )

    # Basic sanity check: if we're still looking at the login page, assume failure
    if "Login to your account" in resp.text and "Logout" not in resp.text:
        raise RuntimeError("Login appears to have failed – check email/password.")

    return session


def get_chip_id(session: requests.Session, microchip: str, implant_date: str, *, debug: bool, dbo: Database) -> str:
    """
    Submit a microchip and implant date to the /_account/register/ endpoint
    and extract the resulting ?ID=XXXX from the redirect/landing URL.
    """
    data = {
        "microchipnumber": microchip,
        "checksum": "",          # as seen in browser request
        "implantdate": implant_date,  # format: dd/mm/yyyy
        "submit3": "Continue",
        "camerascanned": "0",
        "cameraactive": "0",
    }

    resp = post_with_debug(
        session,
        REGISTER_CHIP_URL,
        params={"submit": "true"},
        data=data,
        context=f"Chip registration for microchip {microchip}",
        debug=debug,
        dbo=dbo,
    )

    lower_text = resp.text.lower()
    duplicate_markers = (
        "already registered",
        "not available for registration",
        "previously registered",
    )
    if any(marker in lower_text for marker in duplicate_markers):
        detail = extract_error_details(resp)
        raise MicrochipAlreadyRegistered(f"Microchip {microchip} already registered; {detail}")

    parsed = urlparse(resp.url)
    qs = parse_qs(parsed.query)

    chip_id_list = qs.get("ID") or qs.get("id")
    if not chip_id_list:
        error_detail = extract_error_details(resp)
        raise RuntimeError(f"Could not find ID in resulting URL: {resp.url!r}; {error_detail}")

    return chip_id_list[0]


def confirm_microchip(session: requests.Session, chip_id: str, microchip: str, *, debug: bool, dbo: Database) -> str | None:
    """
    Confirm the microchip number after initial registration to unblock animal registration.
    """
    data = {
        "microchipnumberx2": microchip,
        "submit3": "Continue",
    }

    resp = post_with_debug(
        session,
        "https://www.animaltracker.co.uk/_account/register/confirm/",
        params={"submit": "true", "id": chip_id},
        data=data,
        context=f"Chip confirmation for ID={chip_id}",
        debug=debug,
        dbo=dbo,
    )

    if "confirm the microchip number" in resp.text.lower() or "/confirm/" in resp.url:
        detail = extract_error_details(resp)
        raise RuntimeError(f"Chip confirmation did not proceed for ID={chip_id}; {detail}")

    return extract_microchip_identifier(resp)


def register_keeper(session: requests.Session, chip_id: str, row: Dict[str, str], *, debug: bool, dbo: Database) -> str | None:
    """
    Submit keeper details (type selection) step. Uses optional row fields if provided.
    """
    data = {
        "isFirstKeeper": row.get("isFirstKeeper", "Y"),
        "title": row.get("keeper_title", ""),
        "firstname": row.get("keeper_firstname", ""),
        "lastname": row.get("keeper_lastname", ""),
        "company": row.get("keeper_company", ""),
        "addr1": row.get("keeper_addr1", ""),
        "addr2": row.get("keeper_addr2", ""),
        "addr3": row.get("keeper_addr3", ""),
        "addr4": row.get("keeper_addr4", ""),
        "addr5": row.get("keeper_addr5", ""),
        "postcode": row.get("keeper_postcode", ""),
        "countryID": row.get("keeper_countryID", "215"),
        "email": row.get("keeper_email", ""),
        "validemail": row.get("keeper_validemail", ""),
        "tel": row.get("keeper_tel", ""),
        "mobile": row.get("keeper_mobile", ""),
        "emergencytel": row.get("keeper_emergencytel", ""),
        "eveningtel": row.get("keeper_eveningtel", ""),
        "breederLicence": row.get("keeper_breederLicence", ""),
        "localAuthority": row.get("keeper_localAuthority", ""),
        "submit3": "Continue",
    }

    resp = post_with_debug(
        session,
        "https://www.animaltracker.co.uk/_account/register/keeper/",
        params={"submit": "true", "id": chip_id},
        data=data,
        context=f"Keeper registration for ID={chip_id}",
        debug=debug,
        dbo=dbo,
    )

    if page_contains_error(resp) or "/keeper/" in resp.url:
        detail = extract_error_details(resp)
        raise RuntimeError(f"Keeper step may not have completed for ID={chip_id}; {detail}")

    return extract_microchip_identifier(resp)


def register_animal(
    session: requests.Session,
    chip_id: str,
    row: Dict[str, str],
    *,
    debug: bool,
    dbo: Database,
    fallback_identifier: str | None = None,
) -> str:
    """
    Complete the animal registration for a single animal.
    `row` is a dict with: microchip, implant_date, name, gender, dob, animal_type, breed, colour?, description?
    """
    data = {
        "animalType": row.get("animal_type", "Hedgehog"),
        "animalBreed": row.get("breed", ""),
        "animalName": row["name"],
        "animalGender": row["gender"],       # must match site’s allowed strings
        "animalDOB": row["dob"],             # dd/mm/yyyy
        "animalColour": row.get("colour", ""),
        "animalDescription": row.get("description", ""),
        "submit3": "Complete Registration",
    }

    resp = post_with_debug(
        session,
        REGISTER_ANIMAL_URL,
        params={"submit": "true", "ID": chip_id},
        data=data,
        context=f"Animal registration for ID={chip_id}",
        debug=debug,
        dbo=dbo,
    )

    # Optional: sanity check that we’re not back on the form with errors
    if page_contains_error(resp):
        error_detail = extract_error_details(resp)
        raise RuntimeError(f"Possible error registering animal with ID={chip_id}; {error_detail}")

    microchip_identifier = extract_microchip_identifier(resp) or fallback_identifier or row.get("microchip")
    if debug:
        _log_debug(dbo, f"[DEBUG] Microchip identifier for record lookup: {microchip_identifier}")
    return microchip_identifier


def fetch_record(session: requests.Session, microchip_identifier: str, *, debug: bool, dbo: Database) -> str:
    """
    Fetch the record page for the microchip identifier and return a short snippet.
    """
    resp = get_with_debug(
        session,
        "https://www.animaltracker.co.uk/_account/record/",
        params={"microchipID": microchip_identifier},
        context=f"Fetch record for {microchip_identifier}",
        debug=debug,
        dbo=dbo,
    )

    if page_contains_error(resp):
        detail = extract_error_details(resp)
        raise RuntimeError(f"Record page returned possible error for {microchip_identifier}; {detail}")

    return summarize_text(resp.text, 300)


# ----------------- SYNC HELPERS -----------------

def _format_date_for_tracker(value: Any) -> str:
    """
    Converts a date/datetime to dd/mm/yyyy.
    """
    if value is None:
        raise ValueError("Missing date value")
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime.combine(value, datetime.min.time())
    else:
        raise ValueError(f"Unsupported date value: {value!r}")
    return dt.strftime("%d/%m/%Y")


def _is_truthy_env(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on", "debug"}


def _animal_type_name(dbo: Database, animaltypeid: int | None) -> str:
    if animaltypeid is None:
        return "Animal"
    name = asm3.lookups.get_animaltype_name(dbo, animaltypeid)
    return name or "Animal"


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

def _mark_published(dbo: Database, animal_id: int, note: str = "") -> None:
    dbo.execute("DELETE FROM animalpublished WHERE PublishedTo = ? AND AnimalID = ?", (PUBLISHED_TO, animal_id))
    dbo.execute(
        "INSERT INTO animalpublished (AnimalID, PublishedTo, SentDate, Extra) VALUES (?,?,?,?)",
        (animal_id, PUBLISHED_TO, dbo.now(), note),
    )


def _animals_to_process(dbo: Database, *, days: int, animalname: str | None = None) -> List[ResultRow]:
    sql = """
        SELECT a.ID AS ID,
               a.AnimalName AS ANIMALNAME,
               a.AnimalTypeID AS ANIMALTYPEID,
               a.BreedID AS BREEDID,
               a.Markings AS MARKINGS,
               a.IdentichipNumber AS IDENTICHIPNUMBER,
               a.IdentichipDate AS IDENTICHIPDATE,
               a.DateOfBirth AS DATEOFBIRTH,
               a.Sex AS SEX,
               a.LastChangedDate AS LASTCHANGEDDATE
          FROM animal a
         WHERE 1=1
           AND a.Identichipped = 1
           AND a.IdentichipNumber IS NOT NULL
           AND TRIM(a.IdentichipNumber) <> ''
           AND a.IdentichipDate IS NOT NULL
           AND a.DateOfBirth IS NOT NULL
           AND a.DeceasedDate IS NULL
    """
    params: List[Any] = []
    if animalname:
        sql += " AND lower(trim(a.AnimalName)) = lower(trim(?))"
        params.append(animalname)
    elif days and days > 0:
        cutoff = dbo.today(offset=days * -1)
        sql += " AND a.LastChangedDate >= ?"
        params.append(cutoff)
    sql += """
           AND NOT EXISTS (
                 SELECT 1 FROM animalpublished ap
                  WHERE ap.AnimalID = a.ID AND ap.PublishedTo = ?
           )
         ORDER BY a.LastChangedDate DESC, a.ID DESC
    """
    params.append(PUBLISHED_TO)
    if MAX_PER_RUN and MAX_PER_RUN > 0:
        sql += " LIMIT %d" % int(MAX_PER_RUN)
    return dbo.query(sql, params)


def _build_registration_row(dbo: Database, a: ResultRow) -> Dict[str, str]:
    chip = asm3.utils.nulltostr(getattr(a, "IDENTICHIPNUMBER", "")).strip()
    if not chip:
        raise ValueError("Missing microchip number")
    implant = _format_date_for_tracker(getattr(a, "IDENTICHIPDATE", None))
    dob = _format_date_for_tracker(getattr(a, "DATEOFBIRTH", None))
    sex_id = getattr(a, "SEX", None)
    animal_type_id = getattr(a, "ANIMALTYPEID", None)
    breed_id = getattr(a, "BREEDID", None)
    markings = asm3.utils.nulltostr(getattr(a, "MARKINGS", "")).strip()

    return {
        "microchip": chip,
        "implant_date": implant,
        "name": asm3.utils.nulltostr(getattr(a, "ANIMALNAME", "")).strip(),
        "gender": _sex_name(dbo, sex_id),
        "dob": dob,
        "animal_type": _animal_type_name(dbo, animal_type_id),
        "breed": _breed_name(dbo, breed_id),
        "colour": "Brown",
        "description": markings,
    }


# ----------------- MAIN SYNC ENTRYPOINT -----------------

def sync_recent_animals(dbo: Database, *, days: int | None = None) -> None:
    """
    Public entrypoint: register microchips for animals changed within the last N days.
    """
    lookback = days if days is not None else LOOKBACK_DAYS
    debug = _is_truthy_env(os.getenv("ANIMALTRACKER_DEBUG"))
    dry_run = _is_truthy_env(os.getenv("ANIMALTRACKER_DRY_RUN"))
    animalname = os.getenv("ANIMALTRACKER_ANIMALNAME")
    if animalname:
        animalname = animalname.strip()
    target_dbname = (os.getenv("ANIMALTRACKER_TARGET_DBNAME") or "").strip()
    target_dbalias = (os.getenv("ANIMALTRACKER_TARGET_DBALIAS") or "").strip()

    if target_dbname and dbo.name() != target_dbname:
        _log_debug(dbo, f"Skipping Animal Tracker sync for db={dbo.name()} (target dbname={target_dbname}).")
        return
    if target_dbalias and getattr(dbo, "alias", "") != target_dbalias:
        _log_debug(dbo, f"Skipping Animal Tracker sync for alias={getattr(dbo, 'alias', '')} (target alias={target_dbalias}).")
        return

    email = password = None
    if not dry_run:
        try:
            email, password = get_credentials()
        except RuntimeError as err:
            _log_warn(dbo, str(err))
            return

    animals = _animals_to_process(dbo, days=lookback, animalname=animalname or None)
    if len(animals) == 0:
        if animalname:
            _log_info(dbo, f"No animals named '{animalname}' need Animal Tracker sync.")
        else:
            _log_info(dbo, "No animals need Animal Tracker sync.")
        return

    if dry_run:
        _log_info(dbo, "Animal Tracker dry-run enabled: no registrations or publish marks will be made.")

    if animalname:
        _log_info(dbo, f"Attempting Animal Tracker sync for {len(animals)} animal(s); animalname='{animalname}'.")
    elif lookback and lookback > 0:
        _log_info(dbo, f"Attempting Animal Tracker sync for {len(animals)} animal(s); lookback={lookback} day(s).")
    else:
        _log_info(dbo, f"Attempting Animal Tracker sync for {len(animals)} animal(s).")

    session: requests.Session | None = None
    for idx, a in enumerate(animals, start=1):
        try:
            row = _build_registration_row(dbo, a)
        except Exception as build_err:
            _log_warn(dbo, f"Skipping animal {a.ID}: {build_err}")
            continue
        if debug:
            _log_debug(dbo, f"[DEBUG] Animal Tracker payload source for animal {a.ID}: {row}")

        chip = row["microchip"]
        if len(chip) not in (9, 10, 15):
            _log_warn(dbo, f"Skipping animal {a.ID}: microchip length must be 9/10/15 digits (got {chip}).")
            continue

        if dry_run:
            _log_info(
                dbo,
                f"[{idx}/{len(animals)}] Would register chip {chip} for animal {a.ID} ({row['name']})",
            )
            continue

        if session is None:
            try:
                session = login(email, password, debug=debug, dbo=dbo)
                _log_info(dbo, "Authenticated to Animal Tracker.")
            except Exception as login_err:  # pragma: no cover - network
                _log_error(dbo, f"Login failed: {login_err}", excinfo=None)
                return

        _log_info(
            dbo,
            f"[{idx}/{len(animals)}] Registering chip {chip} for animal {a.ID} ({row['name']})",
        )

        try:
            chip_id = get_chip_id(session, chip, row["implant_date"], debug=debug, dbo=dbo)
            confirm_identifier = confirm_microchip(session, chip_id, chip, debug=debug, dbo=dbo)
            keeper_identifier = register_keeper(session, chip_id, row, debug=debug, dbo=dbo)
            microchip_identifier = register_animal(
                session,
                chip_id,
                row,
                debug=debug,
                dbo=dbo,
                fallback_identifier=keeper_identifier or confirm_identifier,
            )

            try:
                fetch_record(session, microchip_identifier, debug=debug, dbo=dbo)
            except Exception as record_err:  # pragma: no cover - network
                _log_warn(dbo, f"Registered chip {chip} for animal {a.ID} but could not fetch record: {record_err}")

            _mark_published(dbo, a.ID)
            _log_info(dbo, f"Registered chip {chip} for animal {a.ID} and marked as published.")
        except MicrochipAlreadyRegistered:
            _log_info(dbo, f"Chip {chip} already registered; marking animal {a.ID} as published.")
            _mark_published(dbo, a.ID, note="already registered")
        except Exception as err:  # pragma: no cover - network
            _log_error(dbo, f"Failed registering chip {chip} for animal {a.ID}: {err}", excinfo=None)
            continue

        if SLEEP_BETWEEN:
            time.sleep(SLEEP_BETWEEN)


# Alias used by cron
def run(dbo: Database) -> None:
    sync_recent_animals(dbo)
