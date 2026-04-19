
"""
Bulk microchip update — extract chip/animal rows from photographed implant log sheets
and match them against existing animals in the database.

Extraction is delegated to the configured AI provider's vision model. Matching is a
plain SQL lookup with no fuzzy logic — callers must confirm every applied row.
"""

import base64
import datetime
import io
import json
import re

import asm3.al

EXTRACT_SYSTEM_PROMPT = (
    "You read photographs of handwritten microchip implantation log sheets and "
    "extract one row per implant entry as strict JSON. Return ONLY a JSON object "
    "with a top-level 'rows' array — no prose, no markdown fences.\n\n"
    "CRITICAL ACCURACY RULES:\n"
    "- NEVER invent values. If you cannot clearly read a field in the photograph, "
    "return an empty string for that field.\n"
    "- Do not guess plausible-looking names. If unsure, leave name as \"\".\n"
    "- Read the microchip numbers from the PRINTED digits below each barcode — "
    "they all share the same 7-digit prefix on any given sheet (usually 9002550). "
    "If a number you're about to emit doesn't fit that visible prefix, you are "
    "guessing — return \"\" instead.\n"
    "- If the whole image is unreadable (blurred, upside-down, wrong subject), "
    "return {\"rows\": []}."
)

EXTRACT_USER_PROMPT = """Each sheet has these columns (note the column headers carefully — they can be confusing):
- A printed barcode with a 15-digit microchip number below it
- A handwritten DATE OF BIRTH, written next to / beside the barcode
- A handwritten NAME
- A handwritten date in the "COLOUR" column — despite the header, this is actually the
  DATE OF IMPLANTATION (the column is mis-labelled on the printed form)
- A circled sex marker M or F at the end

Return JSON of this exact shape:
{
  "rows": [
    {
      "microchip": "900255003188952",
      "name": "Janet",
      "date_of_birth": "2024-06-21",
      "implant_date": "2025-08-01",
      "sex": "F"
    }
  ]
}

Rules:
- microchip: digits only, no spaces. Read from the printed digits below the barcode.
- name: trim whitespace; preserve original spelling exactly as written. If illegible, use "".
- date_of_birth: ISO format YYYY-MM-DD, from the date written alongside the barcode.
  Assume 2-digit years are 20xx. If unreadable, use "".
- implant_date: ISO format YYYY-MM-DD, from the "COLOUR" column (misnamed — it holds
  the implantation date). Assume 2-digit years are 20xx. If unreadable, use "".
- sex: one of "M", "F", or "" if unclear.
- Include every row you can see, even if some fields are blank.
- CRITICAL: Return rows in the exact top-to-bottom order they appear on each
  sheet. If multiple images are provided, process them in the order given —
  image 1's rows first (in document order), then image 2's rows, and so on.
  Do NOT sort, group, or reorder.
- If a sheet appears blank or unreadable, return {"rows": []}.
- Remember: empty string is ALWAYS better than an invented value.
"""


def _split_data_url(data_url):
    """ Convert a 'data:image/jpeg;base64,...' URL into (media_type, base64_data). """
    m = re.match(r"^data:([^;]+);base64,(.*)$", data_url, re.DOTALL)
    if not m:
        raise ValueError("not a base64 data URL")
    return m.group(1), m.group(2)


def _decode_barcodes_in_image(image_bytes):
    """ Decode 1D barcodes (microchip stickers) in a single image.

    Returns a list of decoded digit strings in top-to-bottom order.
    Silently returns [] if pyzbar/PIL are unavailable or decoding fails.
    """
    try:
        from pyzbar.pyzbar import decode as zbar_decode
        from PIL import Image
    except ImportError:
        asm3.al.warn("pyzbar or Pillow not installed — skipping barcode decode",
                     "microchip_extract._decode_barcodes_in_image")
        return []
    try:
        pil = Image.open(io.BytesIO(image_bytes))
        decoded = zbar_decode(pil)
    except Exception as err:
        asm3.al.error("barcode decode failed: %s" % err,
                      "microchip_extract._decode_barcodes_in_image")
        return []
    # Sort top-to-bottom using the bounding box top edge
    decoded = sorted(decoded, key=lambda d: d.rect.top)
    chips = []
    for d in decoded:
        try:
            value = d.data.decode("utf-8").strip()
        except (UnicodeDecodeError, AttributeError):
            continue
        # Only keep 15-digit numeric values (microchip format)
        if value.isdigit() and len(value) == 15:
            chips.append(value)
    return chips


def decode_barcodes(image_data_urls):
    """ Decode barcodes in every image, returning a flat list preserving image
    order and within-image top-to-bottom order.
    """
    out = []
    for url in image_data_urls:
        try:
            _, b64 = _split_data_url(url)
        except ValueError:
            continue
        try:
            raw = base64.b64decode(b64)
        except Exception:
            continue
        out.extend(_decode_barcodes_in_image(raw))
    return out


def _parse_json_response(text):
    """ Extract the first JSON object from the model's response, tolerating accidental fences. """
    if not text:
        return {"rows": []}
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try:
        parsed = json.loads(s)
    except (ValueError, TypeError):
        first = s.find("{")
        last = s.rfind("}")
        if first == -1 or last == -1:
            return {"rows": []}
        try:
            parsed = json.loads(s[first:last + 1])
        except (ValueError, TypeError):
            return {"rows": []}
    if not isinstance(parsed, dict) or not isinstance(parsed.get("rows"), list):
        return {"rows": []}
    return parsed


def extract_rows(image_data_urls, provider=None):
    """ Send images to the vision model; return list of dicts {microchip, name, implant_date, sex}. """
    if not image_data_urls:
        return []
    if provider is None:
        from asm3.ai_providers import get_provider
        provider = get_provider()

    images = []
    for url in image_data_urls:
        media_type, b64 = _split_data_url(url)
        images.append({"media_type": media_type, "data": b64})

    # Decode barcodes directly from pixels first — deterministic and handles blur
    # much better than vision OCR. Order matches document flow (image 1 top-to-bottom,
    # then image 2, etc.) so we can align positionally with the vision rows.
    barcodes = decode_barcodes(image_data_urls)
    asm3.al.info("pyzbar decoded %d barcodes: %s" % (len(barcodes), barcodes),
                 "microchip_extract.extract_rows")

    response = provider.extract_from_images(EXTRACT_SYSTEM_PROMPT, EXTRACT_USER_PROMPT, images)
    asm3.al.info(
        "microchip_extract response (model=%s, in=%s, out=%s): %s" % (
            getattr(response, "model", "?"),
            getattr(response, "input_tokens", 0),
            getattr(response, "output_tokens", 0),
            (response.text or "")[:2000]),
        "microchip_extract.extract_rows")
    parsed = _parse_json_response(response.text)

    rows = []
    for r in parsed.get("rows", []):
        if not isinstance(r, dict):
            continue
        rows.append({
            "microchip": str(r.get("microchip", "")).strip(),
            "name": str(r.get("name", "")).strip(),
            "implant_date": str(r.get("implant_date", "")).strip(),
            "date_of_birth": str(r.get("date_of_birth", "")).strip(),
            "sex": str(r.get("sex", "")).strip().upper(),
            "chip_source": "vision",
        })

    # Reconcile against the barcode scanner. Positional matching: vision row[i]
    # lines up with barcode[i], since both are top-to-bottom in document order.
    for i, row in enumerate(rows):
        if i < len(barcodes) and row["microchip"] != barcodes[i]:
            row["chip_vision"] = row["microchip"]
            row["microchip"] = barcodes[i]
            row["chip_source"] = "barcode"

    # Append any barcodes the vision model missed entirely (more barcodes than
    # rows returned). These come back with blank name/date so staff can fill in.
    for bc in barcodes[len(rows):]:
        rows.append({
            "microchip": bc,
            "name": "",
            "implant_date": "",
            "date_of_birth": "",
            "sex": "",
            "chip_source": "barcode",
        })

    return rows


def match_rows(dbo, rows):
    """ Annotate each row with a matched animal (case-insensitive exact name match) plus warnings.

    Returns rows with added keys:
      - candidates: list of {id, code, name, archived} for ALL animals matching name
      - matched_animal_id: int if exactly one candidate AND name was non-empty, else None
      - chip_in_use_by: list of {id, code, name} of animals already holding this chip number
      - warnings: list of human-readable warning strings
    """
    out = []
    for r in rows:
        row = dict(r)
        warnings = []
        candidates = []

        name = row["name"]
        if name:
            matches = dbo.query(
                "SELECT ID, ShelterCode, AnimalName, Archived, IdentichipNumber, DateOfBirth FROM animal "
                "WHERE LOWER(TRIM(AnimalName)) = LOWER(?) ORDER BY Archived, ID DESC",
                [name])
            for m in matches:
                dob = m.DATEOFBIRTH
                candidates.append({
                    "id": m.ID,
                    "code": m.SHELTERCODE,
                    "name": m.ANIMALNAME,
                    "archived": int(m.ARCHIVED or 0),
                    "existing_chip": m.IDENTICHIPNUMBER or "",
                    "existing_dob": dob.strftime("%Y-%m-%d") if dob else "",
                })

        row["candidates"] = candidates
        row["matched_animal_id"] = candidates[0]["id"] if (name and len(candidates) == 1) else None

        chip_in_use_by = []
        chip = row["microchip"]
        if chip:
            existing = dbo.query(
                "SELECT ID, ShelterCode, AnimalName FROM animal WHERE IdentichipNumber = ?",
                [chip])
            for m in existing:
                chip_in_use_by.append({
                    "id": m.ID,
                    "code": m.SHELTERCODE,
                    "name": m.ANIMALNAME,
                })
            if len(chip) != 15 or not chip.isdigit():
                warnings.append("Chip number is not 15 digits")

        row["chip_in_use_by"] = chip_in_use_by

        if not chip:
            warnings.append("No microchip number extracted")
        if not name:
            warnings.append("No name extracted")
        elif not candidates:
            warnings.append("No animal matches this name")
        elif len(candidates) > 1:
            warnings.append("%d animals share this name" % len(candidates))

        row["warnings"] = warnings
        out.append(row)
    return out


def apply_updates(dbo, username, confirmed):
    """ Apply confirmed rows to the animal table.

    Args:
        confirmed: list of dicts {animal_id, microchip, implant_date, date_of_birth, sex}.
                   The frontend has already confirmed each animal_id.

    Returns dict with 'applied' (list of ids) and 'errors' (list of {animal_id, error}).
    """
    import asm3.animal
    import asm3.audit

    applied = []
    errors = []
    for r in confirmed:
        try:
            animal_id = int(r.get("animal_id") or 0)
            if animal_id <= 0:
                continue
            chip = str(r.get("microchip", "")).strip()
            implant_date = str(r.get("implant_date", "")).strip()
            date_of_birth = str(r.get("date_of_birth", "")).strip()
            sex = str(r.get("sex", "")).strip().upper()

            updates = {}
            if chip:
                updates["IdentichipNumber"] = chip
                updates["Identichipped"] = 1
            if implant_date:
                try:
                    updates["IdentichipDate"] = datetime.datetime.strptime(implant_date, "%Y-%m-%d")
                except ValueError:
                    pass
            if date_of_birth:
                try:
                    updates["DateOfBirth"] = datetime.datetime.strptime(date_of_birth, "%Y-%m-%d")
                except ValueError:
                    pass
            if sex in ("M", "F"):
                updates["Sex"] = 1 if sex == "M" else 0

            if not updates:
                continue

            if not dbo.query_int("SELECT COUNT(*) FROM animal WHERE ID = ?", [animal_id]):
                errors.append({"animal_id": animal_id, "error": "animal not found"})
                continue

            dbo.update("animal", animal_id, updates, username)

            audit_text = "bulk microchip update: " + ", ".join(
                "%s=%s" % (k, updates[k]) for k in updates)
            asm3.audit.edit(dbo, username, "animal", animal_id, "", audit_text)
            applied.append(animal_id)
        except Exception as err:
            asm3.al.error("apply_updates failed for row %s: %s" % (r, err),
                          "microchip_extract.apply_updates", dbo)
            errors.append({"animal_id": r.get("animal_id"), "error": str(err)})

    return {"applied": applied, "errors": errors}
