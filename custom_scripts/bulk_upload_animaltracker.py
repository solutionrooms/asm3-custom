import csv
import os
import re
import sys
import time
from urllib.parse import parse_qs, unquote, urlparse

import requests


# ----------------- CONFIG -----------------

LOGIN_URL = "https://www.animaltracker.co.uk/_login/?send=true&rt=&tc=&mc=&msg=&route="
REGISTER_CHIP_URL = "https://www.animaltracker.co.uk/_account/register/"
REGISTER_ANIMAL_URL = "https://www.animaltracker.co.uk/_account/register/animal/"

# Path to your CSV (can be overridden with CLI arg FILE=/path/to/file.csv)
DEFAULT_CSV_PATH = "hedgehogs.csv"

# Optional throttle between registrations (seconds)
SLEEP_BETWEEN = 1.0

# Debug snippet length for responses when DEBUG is enabled
DEBUG_SNIPPET_LEN = 1200


class MicrochipAlreadyRegistered(RuntimeError):
    """Raised when the site reports the microchip is already registered."""


# ----------------- CORE FUNCTIONS -----------------

def get_credentials() -> tuple[str, str]:
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


def parse_args(argv: list[str]) -> tuple[str, bool]:
    """
    Allow overriding the CSV source via CLI: FILE=/path/to/file.csv
    Enable verbose debug output via DEBUG=v (true/yes/1/on also accepted).
    """
    csv_path = DEFAULT_CSV_PATH
    debug = False

    for arg in argv:
        if arg.startswith("FILE="):
            candidate = arg.split("=", 1)[1].strip()
            if not candidate:
                raise RuntimeError("FILE= provided without a path.")
            csv_path = candidate
        elif arg.upper().startswith("DEBUG="):
            val = arg.split("=", 1)[1].strip().lower()
            debug = val in {"v", "1", "true", "yes", "y", "on"}

    return csv_path, debug


def validate_csv_path(csv_path: str) -> str:
    """
    Ensure the CSV path exists and is a file.
    """
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    return csv_path


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


def redact_data_for_debug(data: dict | None) -> dict:
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
    params: dict | None,
    data: dict | None,
    context: str,
    debug: bool,
) -> requests.Response:
    """
    Perform a POST request with optional debug output and standard error handling.
    """
    if debug:
        print(f"[DEBUG] POST {url} params={params or {}} data={redact_data_for_debug(data)}")

    resp = session.post(url, params=params, data=data)

    if debug:
        snippet = resp.text[:DEBUG_SNIPPET_LEN].replace("\n", "\\n")
        print(f"[DEBUG] {context} status={resp.status_code} url={resp.url}")
        print(f"[DEBUG] {context} response snippet: {snippet}")

    raise_for_status_with_detail(resp, context)
    return resp


def get_with_debug(
    session: requests.Session,
    url: str,
    *,
    params: dict | None,
    context: str,
    debug: bool,
    allow_error: bool = False,
) -> requests.Response:
    """
    Perform a GET request with optional debug output and standard error handling.
    """
    if debug:
        print(f"[DEBUG] GET  {url} params={params or {}}")

    resp = session.get(url, params=params)

    if debug:
        snippet = resp.text[:DEBUG_SNIPPET_LEN].replace("\n", "\\n")
        print(f"[DEBUG] {context} status={resp.status_code} url={resp.url}")
        print(f"[DEBUG] {context} response snippet: {snippet}")

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


def login(email: str, password: str, *, debug: bool) -> requests.Session:
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
    )

    # Basic sanity check: if we're still looking at the login page, assume failure
    if "Login to your account" in resp.text and "Logout" not in resp.text:
        raise RuntimeError("Login appears to have failed – check email/password.")

    return session


def get_chip_id(session: requests.Session, microchip: str, implant_date: str, *, debug: bool) -> str:
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

    # Let requests follow redirects; final URL should contain ?ID=...
    resp = post_with_debug(
        session,
        REGISTER_CHIP_URL,
        params={"submit": "true"},
        data=data,
        context=f"Chip registration for microchip {microchip}",
        debug=debug,
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


def confirm_microchip(session: requests.Session, chip_id: str, microchip: str, *, debug: bool) -> str | None:
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
    )

    if "confirm the microchip number" in resp.text.lower() or "/confirm/" in resp.url:
        detail = extract_error_details(resp)
        raise RuntimeError(f"Chip confirmation did not proceed for ID={chip_id}; {detail}")

    return extract_microchip_identifier(resp)


def register_keeper(session: requests.Session, chip_id: str, row: dict, *, debug: bool) -> str | None:
    """
    Submit keeper details (type selection) step. Uses optional CSV fields if provided.
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
    )

    if page_contains_error(resp) or "/keeper/" in resp.url:
        detail = extract_error_details(resp)
        raise RuntimeError(f"Keeper step may not have completed for ID={chip_id}; {detail}")

    return extract_microchip_identifier(resp)


def register_hedgehog(
    session: requests.Session,
    chip_id: str,
    row: dict,
    *,
    debug: bool,
    fallback_identifier: str | None = None,
) -> str:
    """
    Complete the animal registration for a single hedgehog.
    `row` is a dict from csv.DictReader.
    """
    data = {
        "animalType": "Hedgehog",
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
    )

    # Optional: sanity check that we’re not back on the form with errors
    if page_contains_error(resp):
        error_detail = extract_error_details(resp)
        raise RuntimeError(f"Possible error registering animal with ID={chip_id}; {error_detail}")

    microchip_identifier = extract_microchip_identifier(resp) or fallback_identifier or row.get("microchip")
    if debug:
        print(f"[DEBUG] Microchip identifier for record lookup: {microchip_identifier}")
    return microchip_identifier


def fetch_record(session: requests.Session, microchip_identifier: str, *, debug: bool) -> str:
    """
    Fetch the record page for the microchip identifier and return a short snippet.
    """
    resp = get_with_debug(
        session,
        "https://www.animaltracker.co.uk/_account/record/",
        params={"microchipID": microchip_identifier},
        context=f"Fetch record for {microchip_identifier}",
        debug=debug,
    )

    if page_contains_error(resp):
        detail = extract_error_details(resp)
        raise RuntimeError(f"Record page returned possible error for {microchip_identifier}; {detail}")

    return summarize_text(resp.text, 300)


def process_csv():
    """
    Main orchestration: login, iterate CSV, register each hedgehog.
    """
    csv_path_raw, debug = parse_args(sys.argv[1:])
    csv_path = validate_csv_path(csv_path_raw)
    email, password = get_credentials()

    session = login(email, password, debug=debug)
    print("Logged in successfully.")
    if debug:
        print(f"[DEBUG] Using CSV {csv_path}")

    required_fields = ["microchip", "implant_date", "name", "gender", "dob"]

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise RuntimeError("CSV appears to have no header row.")

        missing_fields = [field for field in required_fields if field not in reader.fieldnames]
        if missing_fields:
            raise RuntimeError(f"CSV is missing required columns: {', '.join(missing_fields)}")

        for i, row in enumerate(reader, start=1):
            microchip = row.get("microchip", "").strip()
            implant_date = row.get("implant_date", "").strip()  # dd/mm/yyyy
            name = row.get("name", "").strip()
            gender = row.get("gender", "").strip()
            dob = row.get("dob", "").strip()

            if not microchip or not implant_date or not name or not gender or not dob:
                print(f"[{i}] Skipping row with missing required data: {row}")
                continue

            # Normalize values to avoid trailing/leading whitespace being sent to the API
            row["microchip"] = microchip
            row["implant_date"] = implant_date
            row["name"] = name
            row["gender"] = gender
            row["dob"] = dob

            print(f"[{i}] Microchip {microchip} – starting...")

            try:
                chip_id = get_chip_id(session, microchip, implant_date, debug=debug)
                print(f"    Got ID={chip_id}")

                confirm_identifier = confirm_microchip(session, chip_id, microchip, debug=debug)
                print(f"    Confirmed microchip {microchip} for ID={chip_id}")

                keeper_identifier = register_keeper(session, chip_id, row, debug=debug)
                print(f"    Keeper step completed for ID={chip_id}")

                microchip_identifier = register_hedgehog(
                    session,
                    chip_id,
                    row,
                    debug=debug,
                    fallback_identifier=keeper_identifier or confirm_identifier,
                )
                print(f"    Registered hedgehog {row['name']} (ID={chip_id})")

                try:
                    record_snippet = fetch_record(session, microchip_identifier, debug=debug)
                    print(f"    Record page for {microchip_identifier}: {record_snippet}")
                except Exception as record_err:
                    print(f"    WARNING: Unable to fetch record page for {microchip_identifier}: {record_err}")

            except Exception as e:
                if isinstance(e, MicrochipAlreadyRegistered):
                    print(f"    Microchip {microchip} is already registered - skipping.")
                else:
                    print(f"    ERROR: {e}")
                continue

            if SLEEP_BETWEEN:
                time.sleep(SLEEP_BETWEEN)


if __name__ == "__main__":
    process_csv()
