
"""
Scan admission form — extract animal fields from a photographed patient record sheet
and return structured JSON suitable for pre-filling the animal_induction form.

Extraction is delegated to the configured AI provider's vision model. The user prompt
is built dynamically from the deployment's additional-field definitions so shelters
with different form layouts can use the same feature without code changes.

The microchip barcode on the form (if any) is decoded directly from pixels with pyzbar
and used to override / verify the vision OCR result — identical approach to
microchip_extract.py.
"""

import base64
import io
import json
import re

import asm3.al


EXTRACT_SYSTEM_PROMPT = (
    "You read photographs of handwritten animal admission / patient record forms "
    "and extract the filled-in values as strict JSON. Return ONLY a JSON object — "
    "no prose, no markdown fences.\n\n"
    "CRITICAL ACCURACY RULES:\n"
    "- NEVER invent values. If a field is blank or unreadable, use null (or omit it). "
    "Empty is ALWAYS better than an invented value.\n"
    "- Do not guess plausible-looking names. If the patient name is unreadable, use null.\n"
    "- For Y/N circled options: mark \"Y\" only if you can clearly see a circle, ring, "
    "underline or tick around the Y (same for \"N\"). If neither is clearly marked, use null.\n"
    "- For selection options (e.g. BABY / JUV / ADULT, or SEVERE / MODERATE / SLIGHT), "
    "return the exact option that is circled. If none is clearly circled, use null.\n"
    "- For handwritten numbers that are key values (weight, temperature, microchip number, "
    "ml amounts) — read digit by digit, do not fill in gaps from knowledge.\n"
    "- MICROCHIP BARCODE STICKERS: scan the ENTIRE form, not just the microchip field. "
    "A printed barcode sticker (with human-readable digits above/below it) may be "
    "attached anywhere on the form — often in the top-right or margins. These "
    "stickers are applied AFTER admission, when the animal is actually microchipped, "
    "so they may appear on a form where the MICROCHIP Y/N option is circled \"N\". "
    "When a barcode sticker is present and you can read the 15 printed digits:\n"
    "    * return those digits as \"microchip_number\" (ignore any conflicting Y/N circle)\n"
    "    * set \"microchipped\" to \"Y\" regardless of the original Y/N circle, because "
    "the sticker's presence proves the animal has since been chipped\n"
    "  If you can see a barcode but cannot read every digit clearly, return null for "
    "microchip_number rather than a partial/guessed value.\n"
    "- If the image is blank, unreadable, upside-down, or clearly not an admission "
    "form, return an empty object {}."
)


# Additional fields whose FIELDNAME prefixes mark them as belonging to the
# admission / induction form. Any field whose name starts with one of these is
# offered to the AI for extraction.
_ENTRY_FIELD_PREFIXES = ("entry", "admission", "intake", "induction")

# Person-picker fields that the AI cannot reasonably resolve — skip these.
_SKIP_FIELDNAMES = ("entryfoundbyperson", "entrybroughtbyperson", "entryfinder")


def _is_extractable_additional(field):
    fname = (field.get("FIELDNAME") or "").lower()
    if not fname:
        return False
    if fname in _SKIP_FIELDNAMES:
        return False
    return any(fname.startswith(p) for p in _ENTRY_FIELD_PREFIXES)


def _field_type_hint(field):
    """Describe a custom field's accepted shape for the prompt."""
    ftype = field.get("FIELDTYPE", 1)
    lookup_values = (field.get("LOOKUPVALUES") or "").strip()
    if ftype == 0:
        return '"Y" or "N" or null'
    if ftype == 2:
        return "multi-line text or null"
    if ftype == 3:
        return "number or null"
    if ftype == 4:
        return "ISO date YYYY-MM-DD or null"
    if ftype == 5:
        return "number or null"
    if ftype in (6, 7):
        opts = [v.strip() for v in lookup_values.split("|") if v.strip()]
        if opts:
            quoted = ", ".join('"%s"' % o for o in opts)
            if ftype == 7:
                return "array of any of [%s] or null" % quoted
            return "one of %s or null" % quoted
        return "string or null"
    return "string or null"


def _build_user_prompt(additional_fields, lookups):
    """Build the user prompt with deployment-specific field schema.

    Args:
        additional_fields: list of dicts from asm3.additional.get_additional_fields()
        lookups: dict with optional keys:
            - "agegroups": list of str, e.g. ["Baby", "Juvenile", "Adult"]
            - "sexes":     list of dicts with SEX / ID
            - "colours":   list of dicts with BASECOLOUR / ID
            - "entryreasons": list of dicts with REASONNAME / ID

    Returns a multi-line text prompt suitable for the vision call.
    """
    lines = []
    lines.append(
        "The image is a handwritten animal admission / patient record sheet. "
        "Extract every filled-in value you can read and return it as JSON.")
    lines.append("")
    lines.append("Return a JSON object with these top-level keys "
                 "(use null — or omit — for anything that is blank or unreadable):")
    lines.append("")
    lines.append("STANDARD FIELDS:")
    lines.append('- "animalname": string — the patient name / handwritten name')
    lines.append('- "sex": "M" or "F" or null — whichever is circled')
    lines.append('- "date_brought_in": ISO YYYY-MM-DD — the main date at the top of the form '
                 '(assume 2-digit years are 20xx; assume day/month ordering typical of UK forms)')
    lines.append('- "weight_grams": integer — weight in GRAMS. If the form shows "g" or "grams" '
                 'use the value directly; if it shows "kg" multiply by 1000; if "oz" convert '
                 'to grams. Return null if unreadable.')
    lines.append('- "microchip_number": 15-digit string (digits only, no spaces). Look for a '
                 'printed barcode sticker ANYWHERE on the form (top-right, margins, anywhere) '
                 'and read the human-readable digits printed with it. These stickers are '
                 'often applied after admission — include the number even if the Y/N circle '
                 'says N. Return null if there is no barcode, or if you cannot read every digit.')
    lines.append('- "microchipped": "Y" or "N" or null. IMPORTANT: if you extracted a '
                 'microchip_number above (a barcode sticker is present), return "Y" here '
                 'regardless of how the Y/N option is circled, because the sticker proves '
                 'the animal has been chipped. Only use the handwritten Y/N circle when no '
                 'barcode sticker is visible.')
    lines.append('- "where_found": string — the "where found and finders comments" free-text block')
    lines.append('- "comments": string — any other handwritten observations that do not fit '
                 'another field (e.g. reason for death, vet notes, temperament).')

    # Lookup-driven fields
    agegroups = lookups.get("agegroups") or []
    if agegroups:
        lines.append('- "age_group": one of %s or null — whichever AGE option is circled. '
                     'Map common abbreviations: "BABY"/"NEO"/"HOGLET"→a "Baby" style group, '
                     '"JUV"/"JEUV"/"JUVENILE"→"Juvenile", "ADULT"/"AD"→"Adult". Pick the '
                     'closest name from the allowed list.' %
                     ", ".join('"%s"' % n for n in agegroups))

    colours = [c.get("BASECOLOUR") or c.get("basecolour")
               for c in (lookups.get("colours") or []) if c]
    colours = [c for c in colours if c]
    if colours:
        quoted = ", ".join('"%s"' % c for c in colours[:30])
        more = " (and others)" if len(colours) > 30 else ""
        lines.append('- "base_colour": one of %s%s or null — only set this if a colour is '
                     'plainly written on the form.' % (quoted, more))

    entry_reasons = [r.get("REASONNAME") or r.get("reasonname")
                     for r in (lookups.get("entryreasons") or []) if r]
    entry_reasons = [r for r in entry_reasons if r]
    if entry_reasons:
        quoted = ", ".join('"%s"' % r for r in entry_reasons[:30])
        more = " (and others)" if len(entry_reasons) > 30 else ""
        lines.append('- "entry_reason": one of %s%s or null' % (quoted, more))

    # Custom (additional) fields
    extractable = [f for f in additional_fields if _is_extractable_additional(f)]
    if extractable:
        lines.append("")
        lines.append("CUSTOM FIELDS — include these values under a nested \"additional\" "
                     "object, keyed by FIELDNAME. Match each field to the form by its label, "
                     "not just its internal name. Leave out any that are blank/unreadable.")
        for f in extractable:
            fname = f.get("FIELDNAME", "")
            flabel = f.get("FIELDLABEL") or fname
            tooltip = (f.get("TOOLTIP") or "").strip()
            hint = _field_type_hint(f)
            extra = (" — tooltip: %s" % tooltip) if tooltip else ""
            lines.append('  - "%s" (label on form: "%s"): %s%s' %
                         (fname, flabel, hint, extra))

    lines.append("")
    lines.append("OUTPUT RULES:")
    lines.append("- Return a SINGLE valid JSON object; no markdown, no commentary.")
    lines.append("- For every date, output ISO YYYY-MM-DD. Assume 2-digit years are 20xx.")
    lines.append("- Prefer null over guessing. If you are uncertain of any digit in a "
                 "microchip number or any letter in a name, set that field to null.")
    return "\n".join(lines)


def _split_data_url(data_url):
    m = re.match(r"^data:([^;]+);base64,(.*)$", data_url, re.DOTALL)
    if not m:
        raise ValueError("not a base64 data URL")
    return m.group(1), m.group(2)


def _decode_barcode(image_bytes):
    """Try to decode a 15-digit microchip barcode in the form photo.

    Uses the same multi-strategy approach as microchip_extract: original, 2x upscale,
    grayscale + autocontrast + sharpen. Returns the first 15-digit numeric value
    found, or "" if none decoded.
    """
    try:
        from pyzbar.pyzbar import decode as zbar_decode
        from PIL import Image, ImageOps, ImageFilter
    except ImportError:
        asm3.al.warn("pyzbar or Pillow not installed — skipping barcode decode",
                     "admission_extract._decode_barcode")
        return ""
    try:
        pil = Image.open(io.BytesIO(image_bytes))
    except Exception as err:
        asm3.al.warn("could not open image for barcode decode: %s" % err,
                     "admission_extract._decode_barcode")
        return ""

    variants = []
    try:
        variants.append(pil.convert("RGB"))
    except Exception:
        pass
    try:
        w, h = pil.size
        variants.append(pil.convert("RGB").resize((w * 2, h * 2), Image.LANCZOS))
    except Exception:
        pass
    try:
        gray = pil.convert("L")
        sharp = gray.filter(ImageFilter.SHARPEN)
        auto = ImageOps.autocontrast(sharp, cutoff=2)
        variants.append(auto)
    except Exception:
        pass

    for v in variants:
        try:
            results = zbar_decode(v)
        except Exception:
            continue
        for r in results:
            try:
                data = r.data.decode("utf-8", errors="ignore").strip()
            except Exception:
                continue
            if data.isdigit() and len(data) == 15:
                return data
    return ""


def _parse_json_response(text):
    if not text:
        return {}
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
            return {}
        try:
            parsed = json.loads(s[first:last + 1])
        except (ValueError, TypeError):
            return {}
    return parsed if isinstance(parsed, dict) else {}


def extract_form(image_data_url, additional_fields=None, lookups=None, provider=None):
    """Send a single scanned admission form to the vision model and return the extracted fields.

    Args:
        image_data_url: 'data:image/jpeg;base64,...' URL (client-rotated + downscaled).
        additional_fields: list from asm3.additional.get_additional_fields(dbo, 0, "animal").
        lookups: dict with optional "agegroups" (list[str]), "colours" (list of rows with
                 BASECOLOUR key), "entryreasons" (list of rows with REASONNAME key).
        provider: pre-built provider (mainly for tests). Defaults to configured provider.

    Returns a dict:
        {
          "extracted": dict  (keys per the prompt schema plus optional "additional" child),
          "barcode": str     (pyzbar-decoded 15-digit chip, or ""),
          "model": str,
          "input_tokens": int,
          "output_tokens": int,
          "elapsed_seconds": float
        }
    """
    import time
    start = time.time()

    if provider is None:
        from asm3.ai_providers import get_provider
        provider = get_provider()

    media_type, b64 = _split_data_url(image_data_url)
    images = [{"media_type": media_type, "data": b64}]

    raw_bytes = base64.b64decode(b64)
    barcode = _decode_barcode(raw_bytes)
    asm3.al.info("pyzbar decoded barcode: %r" % barcode,
                 "admission_extract.extract_form")

    user_prompt = _build_user_prompt(additional_fields or [], lookups or {})

    response = provider.extract_from_images(EXTRACT_SYSTEM_PROMPT, user_prompt, images)
    elapsed = time.time() - start
    asm3.al.info(
        "admission_extract response (model=%s, in=%s, out=%s, elapsed=%.1fs): %s" % (
            getattr(response, "model", "?"),
            getattr(response, "input_tokens", 0),
            getattr(response, "output_tokens", 0),
            elapsed,
            (response.text or "")[:3000]),
        "admission_extract.extract_form")

    extracted = _parse_json_response(response.text)

    # Barcode takes priority over vision for the microchip number — deterministic
    # pixel decode beats OCR when it succeeds.
    existing_chip = ""
    if isinstance(extracted, dict):
        existing_chip = str(extracted.get("microchip_number") or "").strip()
    if barcode:
        extracted["microchip_number"] = barcode
        extracted["microchip_source"] = "barcode"
    elif existing_chip:
        extracted["microchip_source"] = "vision"

    # A chip number from either source means the animal is chipped — override any
    # "N" the model returned for microchipped (which may just reflect the original
    # handwritten circle, predating the later-applied sticker).
    final_chip = str(extracted.get("microchip_number") or "").strip() if isinstance(extracted, dict) else ""
    if final_chip:
        extracted["microchipped"] = "Y"

    return {
        "extracted": extracted,
        "barcode": barcode,
        "model": getattr(response, "model", ""),
        "input_tokens": getattr(response, "input_tokens", 0),
        "output_tokens": getattr(response, "output_tokens", 0),
        "elapsed_seconds": round(elapsed, 2),
    }


# ----- Post-induction compare / apply ------------------------------------------------
#
# After induction, the user can re-scan the admission form media and compare values
# to the current animal record. The flow is:
#   1. find_admission_form_media(dbo, animal_id) — locate the stored scan
#   2. extract_form(...) — run the vision model
#   3. build_comparison(dbo, animal_id, extracted, additional_fields) — per-field diff
#   4. apply_selected(dbo, username, animal_id, selections) — apply user-ticked values
# -----------------------------------------------------------------------------------

# Filenames the induction flow uploads scans as. Match any of these to auto-find the
# admission form media. The lookup is case-insensitive and uses MEDIANAME which is
# the display filename (not the internal DBFS name).
ADMISSION_FORM_FILENAMES = ("admission_form_scan.jpg", "admission_form_scan.jpeg")


def find_admission_form_media(dbo, animal_id):
    """Find the admission-form-scan media attached to this animal, newest first.
    Returns a dict {ID, MEDIANAME, MEDIAMIMETYPE} or None if not found.
    """
    import asm3.media
    rows = asm3.media.get_media(dbo, asm3.media.ANIMAL, animal_id)
    wanted = set(s.lower() for s in ADMISSION_FORM_FILENAMES)
    for m in rows:
        name = str(m.MEDIANAME or "").lower()
        if name in wanted:
            return m
        # Also accept any filename starting with "admission_form_scan"
        if name.startswith("admission_form_scan"):
            return m
    return None


def _fmt_date(d):
    """Format a DB datetime value as YYYY-MM-DD; None → ""."""
    if d is None:
        return ""
    try:
        return d.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _parse_iso_date(s):
    """Parse YYYY-MM-DD or return None."""
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s.strip(), "%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def _lookup_id_by_name(rows, name_key, wanted):
    """Case-insensitive exact + substring match; returns row ID or None."""
    if not wanted or not rows:
        return None
    target = str(wanted).strip().lower()
    for r in rows:
        name = str(r.get(name_key) or "").strip().lower()
        if name == target:
            return r.ID
    for r in rows:
        name = str(r.get(name_key) or "").strip().lower()
        if name and (target in name or name in target):
            return r.ID
    return None


def build_comparison(dbo, animal_id, extracted_data, additional_fields):
    """Build a per-field comparison between the animal record and extracted form data.

    Returns a list of dicts, each:
        {
          "key": str,              # stable id for the apply endpoint to match on
          "label": str,            # human label for the UI
          "current": str,          # display value of what's on the record now
          "scanned": str,          # display value of what the scan extracted
          "scanned_raw": any,      # original raw extracted value for apply
          "differ": bool,          # true when the values don't match
        }

    Only rows where differ=True are returned — matching rows don't need user review.
    """
    import asm3.animal
    import asm3.lookups
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return []
    ex = extracted_data or {}

    colours = asm3.lookups.get_basecolours(dbo)
    entry_reasons = asm3.lookups.get_entryreasons(dbo)

    rows = []

    def add(key, label, current, scanned, scanned_raw=None, eq_check=None):
        cs = "" if current is None else str(current)
        ss = "" if scanned is None else str(scanned)
        if eq_check is not None:
            differ = not eq_check(cs, ss)
        else:
            differ = (cs.strip().lower() != ss.strip().lower())
        # Skip if scan produced nothing — we can't usefully overwrite with empty
        if scanned in (None, "", []):
            return
        rows.append({
            "key": key,
            "label": label,
            "current": cs,
            "scanned": ss,
            "scanned_raw": scanned if scanned_raw is None else scanned_raw,
            "differ": differ,
        })

    # Name
    add("animalname", "Name", a.ANIMALNAME, ex.get("animalname"))

    # Sex — DB stores 0=F, 1=M, 2=U; extract returns "M"/"F"
    sex_scan = ex.get("sex")
    if sex_scan in ("M", "F"):
        sex_current_label = {0: "F", 1: "M", 2: "U"}.get(int(a.SEX or 2), "?")
        add("sex", "Sex", sex_current_label, sex_scan, scanned_raw=sex_scan)

    # Dates
    add("datebroughtin", "Date Brought In",
        _fmt_date(a.DATEBROUGHTIN), ex.get("date_brought_in"))
    add("dateofbirth", "Date of Birth",
        _fmt_date(a.DATEOFBIRTH), ex.get("date_of_birth"))

    # Weight (stored as float on the animal record; scan extracts grams as int)
    w_scan = ex.get("weight_grams")
    if w_scan not in (None, ""):
        try:
            w_scan_num = float(w_scan)
        except (ValueError, TypeError):
            w_scan_num = None
        if w_scan_num is not None:
            current_w = a.WEIGHT
            add("weight", "Weight",
                ("" if current_w in (None, "") else str(current_w)),
                str(int(w_scan_num) if w_scan_num.is_integer() else w_scan_num),
                scanned_raw=w_scan_num)

    # Microchip number + chipped flag
    chip_scan = (ex.get("microchip_number") or "").strip()
    if chip_scan:
        add("identichipnumber", "Microchip Number",
            a.IDENTICHIPNUMBER or "", chip_scan)
    chipped_scan = ex.get("microchipped")
    if chipped_scan in ("Y", "N"):
        current_chipped = "Y" if int(a.IDENTICHIPPED or 0) == 1 else "N"
        add("identichipped", "Microchipped",
            current_chipped, chipped_scan, scanned_raw=chipped_scan)

    # Base colour
    bc_scan = ex.get("base_colour")
    if bc_scan:
        cid = _lookup_id_by_name(colours, "BASECOLOUR", bc_scan)
        if cid:
            current_bc_name = ""
            for c in colours:
                if c.ID == a.BASECOLOURID:
                    current_bc_name = c.BASECOLOUR; break
            add("basecolourid", "Base Colour",
                current_bc_name, bc_scan, scanned_raw=cid)

    # Entry reason
    er_scan = ex.get("entry_reason")
    if er_scan:
        rid = _lookup_id_by_name(entry_reasons, "REASONNAME", er_scan)
        if rid:
            current_er_name = ""
            for r in entry_reasons:
                if r.ID == a.ENTRYREASONID:
                    current_er_name = r.REASONNAME; break
            add("entryreasonid", "Entry Reason",
                current_er_name, er_scan, scanned_raw=rid)

    # Additional fields (custom entry* fields defined on the animal)
    add_data = ex.get("additional") or {}
    for f in (additional_fields or []):
        fname = (f.get("FIELDNAME") or "")
        scanned_val = add_data.get(fname)
        if scanned_val in (None, "", []):
            continue
        current_val = f.get("VALUE") or ""
        ftype = f.get("FIELDTYPE", 1)
        if ftype == 0:
            # YESNO checkbox — DB stores "1"/"0", scan returns "Y"/"N"
            cur_norm = "Y" if str(current_val).strip() in ("1", "Y", "y", "yes", "True", "true") else "N"
            add("add_" + str(f.ID), f.get("FIELDLABEL") or fname,
                cur_norm, str(scanned_val), scanned_raw=scanned_val,
                eq_check=lambda cs, ss: cs.upper() == str(ss).upper())
        elif ftype == 6:
            # LOOKUP — translate Y/N abbreviations to whatever the field's
            # LOOKUPVALUES actually contain (commonly "Yes"/"No") so both the
            # displayed values and the stored value line up with the dropdown.
            opts = [v.strip() for v in (f.get("LOOKUPVALUES") or "").split("|") if v.strip()]
            display_val = str(scanned_val)
            apply_val = display_val
            if opts:
                vu = display_val.upper()
                mapped = None
                if vu in ("Y", "YES"):
                    for o in opts:
                        if o.lower() == "yes":
                            mapped = o; break
                elif vu in ("N", "NO"):
                    for o in opts:
                        if o.lower() == "no":
                            mapped = o; break
                if not mapped:
                    # case-insensitive exact match on the options
                    for o in opts:
                        if o.lower() == display_val.lower():
                            mapped = o; break
                if mapped:
                    display_val = mapped
                    apply_val = mapped
            add("add_" + str(f.ID), f.get("FIELDLABEL") or fname,
                str(current_val), display_val, scanned_raw=apply_val)
        else:
            add("add_" + str(f.ID), f.get("FIELDLABEL") or fname,
                current_val, str(scanned_val), scanned_raw=scanned_val)

    return rows


def apply_selected(dbo, username, animal_id, selections):
    """Apply chosen field values from a form scan comparison to the animal record.

    Args:
        selections: list of dicts [{key, scanned_raw}] — the user-chosen rows from
                    build_comparison(). Values already normalized by the frontend.

    Core fields go through direct column updates; custom (additional.*) fields
    use asm3.additional.insert_additional which is delete-then-insert for one row.
    Returns (applied_count, errors[]).
    """
    import asm3.animal
    import asm3.additional
    import asm3.audit

    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return 0, ["animal not found"]

    applied = 0
    errors = []
    updates = {}
    audit_parts = []

    for sel in selections or []:
        key = sel.get("key") or ""
        val = sel.get("scanned_raw")
        if not key:
            continue
        try:
            if key == "animalname":
                updates["AnimalName"] = str(val or "").strip()
            elif key == "sex":
                updates["Sex"] = 1 if str(val).upper() == "M" else 0
            elif key == "datebroughtin":
                d = _parse_iso_date(val)
                if d: updates["DateBroughtIn"] = d
            elif key == "dateofbirth":
                d = _parse_iso_date(val)
                if d: updates["DateOfBirth"] = d
            elif key == "weight":
                updates["Weight"] = float(val)
            elif key == "identichipnumber":
                updates["IdentichipNumber"] = str(val).strip()
                updates["Identichipped"] = 1
            elif key == "identichipped":
                updates["Identichipped"] = 1 if str(val).upper() == "Y" else 0
            elif key == "basecolourid":
                updates["BaseColourID"] = int(val)
            elif key == "entryreasonid":
                updates["EntryReasonID"] = int(val)
            elif key.startswith("add_"):
                try:
                    field_id = int(key[4:])
                except ValueError:
                    continue
                # YESNO fields: normalize Y/N to 1/0 for storage consistency with the UI
                store_val = val
                if str(val).upper() in ("Y", "YES", "TRUE"): store_val = "1"
                elif str(val).upper() in ("N", "NO", "FALSE"): store_val = "0"
                asm3.additional.insert_additional(dbo, asm3.additional.ANIMAL,
                                                  animal_id, field_id, str(store_val))
                applied += 1
                audit_parts.append("%s=%s" % (key, store_val))
                continue
            else:
                errors.append("unknown key: %s" % key)
                continue
            applied += 1
            audit_parts.append("%s=%s" % (key, val))
        except Exception as err:
            errors.append("%s: %s" % (key, err))

    if updates:
        try:
            dbo.update("animal", animal_id, updates, username)
        except Exception as err:
            errors.append("animal update: %s" % err)
            applied -= len([k for k in updates if True])  # conservative rollback count

    if audit_parts:
        try:
            asm3.audit.edit(dbo, username, "animal", animal_id, "",
                            "Admission form scan applied: %s" % ", ".join(audit_parts))
        except Exception:
            pass

    return applied, errors
