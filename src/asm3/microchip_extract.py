
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

    Tries multiple strategies (original, 2x upscale, contrast-boosted, grayscale)
    because pyzbar's single-shot detection often misses barcodes on phone photos
    that are slightly blurry or low-contrast. Results are deduplicated on value
    and returned in top-to-bottom document order using the bounding-box Y of the
    first detection of each chip.

    Silently returns [] if pyzbar/Pillow are unavailable or all strategies fail.
    """
    try:
        from pyzbar.pyzbar import decode as zbar_decode
        from PIL import Image, ImageOps, ImageFilter
    except ImportError:
        asm3.al.warn("pyzbar or Pillow not installed — skipping barcode decode",
                     "microchip_extract._decode_barcodes_in_image")
        return []
    try:
        pil = Image.open(io.BytesIO(image_bytes))
    except Exception as err:
        asm3.al.error("barcode image open failed: %s" % err,
                      "microchip_extract._decode_barcodes_in_image")
        return []

    # value -> (y_top_in_original_coords, source_strategy)
    seen = {}

    def collect(img, scale, label):
        try:
            decoded = zbar_decode(img)
        except Exception as err:
            asm3.al.error("barcode decode pass %s failed: %s" % (label, err),
                          "microchip_extract._decode_barcodes_in_image")
            return 0
        added = 0
        for d in decoded:
            try:
                value = d.data.decode("utf-8").strip()
            except (UnicodeDecodeError, AttributeError):
                continue
            if value.isdigit() and len(value) == 15 and value not in seen:
                seen[value] = (d.rect.top / scale, label)
                added += 1
        return added

    n_orig = collect(pil, 1.0, "orig")

    # 2x upscale helps on smaller/softer barcodes that are below the
    # decoder's sweet spot at native resolution.
    if max(pil.width, pil.height) < 3500:
        upscaled = pil.resize((pil.width * 2, pil.height * 2), Image.LANCZOS)
        n_up = collect(upscaled, 2.0, "2x")
    else:
        n_up = 0

    # Grayscale + autocontrast + sharpen recovers low-contrast / mildly blurry
    # codes. Cutoff=2 clips the brightest/darkest 2% before stretching.
    try:
        enhanced = pil.convert("L")
        enhanced = ImageOps.autocontrast(enhanced, cutoff=2)
        enhanced = enhanced.filter(ImageFilter.SHARPEN)
        n_enh = collect(enhanced, 1.0, "sharp")
    except Exception as err:
        asm3.al.error("enhance pass failed: %s" % err,
                      "microchip_extract._decode_barcodes_in_image")
        n_enh = 0

    asm3.al.debug("barcode decode passes: orig=%d, 2x=%d, sharp=%d, total_unique=%d" %
                  (n_orig, n_up, n_enh, len(seen)),
                  "microchip_extract._decode_barcodes_in_image")

    # Sort by Y position (top-to-bottom)
    ordered = [v for v, _ in sorted(seen.items(), key=lambda kv: kv[1][0])]
    return _filter_outlier_prefixes(ordered)


def _filter_outlier_prefixes(chips):
    """ Drop chips whose long prefix doesn't match the majority of chips in the
    same image. Microchip batches from one supplier share 10+ digits of prefix,
    so a lone outlier is almost certainly a barcode-decoder misread.
    """
    if len(chips) < 3:
        return chips  # not enough to vote
    PREFIX_LEN = 10
    from collections import Counter
    counts = Counter(c[:PREFIX_LEN] for c in chips)
    majority_prefix, majority_count = counts.most_common(1)[0]
    # Only filter if the majority is a clear winner (more than half of chips)
    if majority_count * 2 <= len(chips):
        return chips
    kept = [c for c in chips if c.startswith(majority_prefix)]
    dropped = [c for c in chips if not c.startswith(majority_prefix)]
    if dropped:
        asm3.al.info("dropped likely barcode misreads (prefix != %s): %s" %
                     (majority_prefix, dropped),
                     "microchip_extract._filter_outlier_prefixes")
    return kept


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

    # Reconcile against the barcode scanner.
    #
    # Phase 1 (value match): if vision's chip for a row is in the barcode set,
    # mark that row as barcode-verified — both sources agree so we have high
    # confidence. This is the primary signal users care about.
    barcode_set = set(barcodes)
    for row in rows:
        if row["microchip"] and row["microchip"] in barcode_set:
            row["chip_source"] = "barcode"

    # Phase 2 (positional override): for any vision rows whose chip wasn't
    # in the barcode set, see if pyzbar found a different value at roughly
    # the same position. Match unused barcodes to still-unverified rows in
    # document order — this catches cases where vision misread digits.
    unused_barcodes = [b for b in barcodes if not any(r["microchip"] == b for r in rows)]
    unused_idx = 0
    for row in rows:
        if row["chip_source"] == "vision" and unused_idx < len(unused_barcodes):
            row["chip_vision"] = row["microchip"]
            row["microchip"] = unused_barcodes[unused_idx]
            row["chip_source"] = "barcode"
            unused_idx += 1

    # Phase 3: any leftover barcodes are real chips vision missed entirely —
    # append them as blank-name rows so staff can identify the animal.
    for bc in unused_barcodes[unused_idx:]:
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


def _attach_image_to_animal(dbo, username, animal_id, data_url, image_number, total):
    """ Attach a processed image (rotated/downscaled on the client) as media
    against an animal record. Used to keep a permanent audit trail of where
    the bulk microchip update got its data.
    """
    import asm3.media
    import asm3.utils

    # data_url looks like "data:image/jpeg;base64,..." — attach_file_from_form
    # strips the data:mime prefix internally, so we pass it through unchanged.
    label = "implant_log_%d_of_%d.jpg" % (image_number, total)
    posted_data = asm3.utils.PostedData({
        "filedata": data_url,
        "filename": label,
        "filetype": "image/jpeg",
        "comments": "Bulk microchip update — source log sheet",
        "flags": "",
        "transformed": "1",  # already rotated + downscaled in the browser
    }, dbo.locale)
    try:
        return asm3.media.attach_file_from_form(
            dbo, username, asm3.media.ANIMAL, animal_id, 0, posted_data)
    except Exception as err:
        asm3.al.error("attach source image to animal %s failed: %s" % (animal_id, err),
                      "microchip_extract._attach_image_to_animal", dbo)
        return 0


def apply_updates(dbo, username, confirmed, images=None):
    """ Apply confirmed rows to the animal table.

    Args:
        confirmed: list of dicts {animal_id, microchip, implant_date, date_of_birth, sex}.
                   The frontend has already confirmed each animal_id.
        images: optional list of base64 data URLs (the processed log sheet photos).
                When provided, every image is attached as media to every animal
                whose update succeeded, giving staff a permanent source record.

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

            # Attach each source image as media on this animal for audit trail.
            # Failures are logged but don't abort the overall apply (the chip
            # update itself has already succeeded at this point).
            if images:
                for i, img in enumerate(images):
                    if img:
                        _attach_image_to_animal(dbo, username, animal_id, img, i + 1, len(images))
        except Exception as err:
            asm3.al.error("apply_updates failed for row %s: %s" % (r, err),
                          "microchip_extract.apply_updates", dbo)
            errors.append({"animal_id": r.get("animal_id"), "error": str(err)})

    return {"applied": applied, "errors": errors}
