
import asm3.al
import asm3.animal
import asm3.configuration
import asm3.diary
import asm3.i18n
import asm3.log
import asm3.lookups
import asm3.medical
import asm3.movement
import asm3.person
import asm3.reports
import asm3.users
import asm3.utils

from asm3.sitedefs import AI_API_KEY
from asm3.typehints import Database, Session

import datetime
import json

# Action confirmation tiers
CONFIRM_NONE = 0       # Read-only, execute immediately
CONFIRM_STANDARD = 1   # Write action, ask for confirmation
CONFIRM_ALWAYS = 2     # Destructive action, always confirm

TOOL_DEFINITIONS = [
    {
        "name": "search_animal",
        "description": "Search animals by name, code, or microchip. Skip this if viewing the animal already.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term: animal name, shelter code, or microchip number"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_animal_details",
        "description": "Get full details of a specific animal including medical history, location, and status.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"}
            },
            "required": ["animal_id"]
        }
    },
    {
        "name": "add_animal",
        "description": "Register a new animal in the shelter. Requires at least a name, species, and animal type.",
        "permission": asm3.users.ADD_ANIMAL,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Animal's name"},
                "species_id": {"type": "integer", "description": "Species ID (use get_species to look up)"},
                "animal_type_id": {"type": "integer", "description": "Animal type ID"},
                "breed_id": {"type": "integer", "description": "Primary breed ID (use get_breeds to look up)"},
                "sex": {"type": "integer", "description": "0=Female, 1=Male, 2=Unknown"},
                "estimated_age": {"type": "string", "description": "Estimated age in years e.g. '1' or '0.5'"},
                "date_of_birth": {"type": "string", "description": "Date of birth YYYY-MM-DD if known"},
                "colour_id": {"type": "integer", "description": "Colour ID"},
                "internal_location_id": {"type": "integer", "description": "Shelter location ID"},
                "markings": {"type": "string", "description": "Physical description or markings"},
                "comments": {"type": "string", "description": "Additional notes"},
                "microchip": {"type": "string", "description": "Microchip number if known"},
                "entry_reason_id": {"type": "integer", "description": "Entry reason ID"}
            },
            "required": ["name", "species_id", "animal_type_id"]
        }
    },
    {
        "name": "update_weight",
        "description": "Record a new weight measurement for an animal.",
        "permission": asm3.users.CHANGE_ANIMAL,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "weight": {"type": "number", "description": "Weight value in grams"}
            },
            "required": ["animal_id", "weight"]
        }
    },
    {
        "name": "get_weight_history",
        "description": "Get weight history for an animal with trend analysis. Use when asked about weight gain, health progress, or how an animal is doing.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"}
            },
            "required": ["animal_id"]
        }
    },
    {
        "name": "move_animal",
        "description": "Move an animal to a different location within the shelter.",
        "permission": asm3.users.CHANGE_ANIMAL,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "location_id": {"type": "integer", "description": "Target internal location ID (use get_locations to look up)"},
                "unit": {"type": "string", "description": "Unit/pen within the location (optional)"}
            },
            "required": ["animal_id", "location_id"]
        }
    },
    {
        "name": "add_observation",
        "description": "Record a daily observation for an animal. Observation field names and allowed values are in the system prompt - use them directly, do NOT call get_observation_fields.",
        "permission": asm3.users.ADD_LOG,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "observations": {"type": "object", "description": "Dict of field_name: value pairs, e.g. {\"Eaten\": \"All\", \"Drunk\": \"Half\", \"Toilet\": \"Faeces\"}"},
                "poo_sample": {"type": "string", "description": "Yes or No - whether a poo sample was taken (required if triggered)"},
                "clinician_notified": {"type": "string", "description": "Yes or No - whether clinician was notified (required if triggered)"}
            },
            "required": ["animal_id", "observations"]
        }
    },
    {
        "name": "get_observation_fields",
        "description": "Get the configured daily observation fields, their allowed values, and validation rules. Call this before add_observation to know which fields to prompt for.",
        "permission": asm3.users.ADD_LOG,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "add_log",
        "description": "Add a general log note to an animal's record. For daily observations use add_observation instead.",
        "permission": asm3.users.ADD_LOG,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "comments": {"type": "string", "description": "The observation or note text"},
                "log_type_id": {"type": "integer", "description": "Log type ID (defaults to first available type)"}
            },
            "required": ["animal_id", "comments"]
        }
    },
    {
        "name": "add_vaccination",
        "description": "Record a vaccination given to an animal.",
        "permission": asm3.users.ADD_VACCINATION,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "vaccination_type_id": {"type": "integer", "description": "Vaccination type ID (use get_vaccination_types to look up)"},
                "date_given": {"type": "string", "description": "Date given YYYY-MM-DD, defaults to today"},
                "comments": {"type": "string", "description": "Additional notes about the vaccination"},
                "batch_number": {"type": "string", "description": "Vaccine batch number"},
                "manufacturer": {"type": "string", "description": "Vaccine manufacturer"}
            },
            "required": ["animal_id", "vaccination_type_id"]
        }
    },
    {
        "name": "add_test",
        "description": "Record a medical test and its result for an animal.",
        "permission": asm3.users.ADD_TEST,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "test_type_id": {"type": "integer", "description": "Test type ID (use get_test_types to look up)"},
                "result_id": {"type": "integer", "description": "Test result ID"},
                "date_of_test": {"type": "string", "description": "Date of test YYYY-MM-DD, defaults to today"},
                "comments": {"type": "string", "description": "Additional notes about the test"}
            },
            "required": ["animal_id", "test_type_id", "result_id"]
        }
    },
    {
        "name": "add_medical_treatment",
        "description": "Add a medical treatment regimen for an animal (e.g., medication course).",
        "permission": asm3.users.ADD_MEDICAL,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "treatment_name": {"type": "string", "description": "Name of the treatment or medication"},
                "dosage": {"type": "string", "description": "Dosage information"},
                "comments": {"type": "string", "description": "Additional notes"},
                "start_date": {"type": "string", "description": "Start date YYYY-MM-DD, defaults to today"}
            },
            "required": ["animal_id", "treatment_name"]
        }
    },
    {
        "name": "add_diary",
        "description": "Add a diary/task entry, optionally scheduled for a future date.",
        "permission": asm3.users.ADD_DIARY,
        "confirm": CONFIRM_STANDARD,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "Animal ID to link to (optional)"},
                "diary_date": {"type": "string", "description": "Date for the diary entry YYYY-MM-DD, defaults to today"},
                "subject": {"type": "string", "description": "Subject/title of the entry"},
                "note": {"type": "string", "description": "Diary note content"}
            },
            "required": ["subject", "note"]
        }
    },
    {
        "name": "search_person",
        "description": "Search for a person (owner, adopter, volunteer) by name or other details.",
        "permission": asm3.users.VIEW_PERSON,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term: person name, address, phone, or email"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_locations",
        "description": "List all internal shelter locations (buildings, rooms, enclosures).",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_species",
        "description": "List all animal species and their IDs.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_breeds",
        "description": "List breeds, optionally filtered by species.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "species_id": {"type": "integer", "description": "Species ID to filter breeds for (optional)"}
            }
        }
    },
    {
        "name": "get_vaccination_types",
        "description": "List available vaccination types and their IDs.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_test_types",
        "description": "List available medical test types and their IDs.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "list_reports",
        "description": "List saved reports, optionally filtered by keyword. Use run_report to open one.",
        "permission": asm3.users.VIEW_REPORT,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Optional keyword to filter reports by title or category"}
            }
        }
    },
    {
        "name": "run_report",
        "description": "Open a report by ID. Use list_reports first to find the ID.",
        "permission": asm3.users.VIEW_REPORT,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "report_id": {"type": "integer", "description": "The report ID from list_reports"}
            },
            "required": ["report_id"]
        }
    },
    {
        "name": "create_movement",
        "description": "Create a movement. Types: 1=Adoption, 2=Foster, 3=Transfer, 4=Escaped, 5=Reclaimed, 6=Stolen, 7=Released. Always ask for a person.",
        "permission": asm3.users.ADD_MOVEMENT,
        "confirm": CONFIRM_ALWAYS,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "movement_type": {"type": "integer", "description": "Movement type: 1=Adoption, 2=Foster, 3=Transfer, 4=Escaped, 5=Reclaimed, 6=Stolen, 7=Released"},
                "person_id": {"type": "integer", "description": "Person ID (required for adoption, foster, transfer, reclaim)"},
                "movement_date": {"type": "string", "description": "Movement date YYYY-MM-DD, defaults to today"},
                "comments": {"type": "string", "description": "Comments about the movement"}
            },
            "required": ["animal_id", "movement_type"]
        }
    },
    {
        "name": "record_death",
        "description": "Record an animal's death. Death reason IDs are in the system prompt - use them directly, do NOT call get_death_reasons.",
        "permission": asm3.users.CHANGE_ANIMAL,
        "confirm": CONFIRM_ALWAYS,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "deceased_date": {"type": "string", "description": "Date of death YYYY-MM-DD"},
                "death_reason_id": {"type": "integer", "description": "Death reason ID (use get_death_reasons to look up)"},
                "put_to_sleep": {"type": "boolean", "description": "Whether the animal was euthanised (true/false)"},
                "dead_on_arrival": {"type": "boolean", "description": "Whether the animal was dead on arrival (true/false, defaults to false)"},
                "comments": {"type": "string", "description": "Notes about the death"}
            },
            "required": ["animal_id", "deceased_date", "death_reason_id"]
        }
    },
    {
        "name": "get_movement_types",
        "description": "List available movement types and their IDs.",
        "permission": asm3.users.VIEW_MOVEMENT,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_death_reasons",
        "description": "List available death/euthanasia reasons and their IDs.",
        "permission": asm3.users.VIEW_ANIMAL,
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "navigate_to",
        "description": "Navigate browser to a page. Pages: animal?id=ID, person?id=ID, shelterview, animal_new, main.",
        "permission": "",
        "confirm": CONFIRM_NONE,
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The page URL to navigate to, e.g. 'animal?id=123' or 'shelterview'"}
            },
            "required": ["url"]
        }
    },
]


def get_tool_by_name(name):
    """Return a tool definition by name, or None."""
    for t in TOOL_DEFINITIONS:
        if t["name"] == name:
            return t
    return None


def get_available_tools(session):
    """Return tool definitions filtered by the user's permissions, formatted for Claude API."""
    available = []
    for t in TOOL_DEFINITIONS:
        if t["permission"] == "" or asm3.users.check_permission_bool(session, t["permission"]):
            available.append({
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"]
            })
    return available


def build_system_prompt(dbo, session, context=None):
    """Build the system prompt with shelter context and page awareness."""
    l = session.locale
    org = asm3.configuration.organisation(dbo)
    today = datetime.date.today().isoformat()
    username = session.user

    # Get lookup data for context
    locations = asm3.lookups.get_internal_locations(dbo)
    species = asm3.lookups.get_species(dbo)

    location_list = ", ".join(["%s (ID: %d)" % (loc.LOCATIONNAME, loc.ID) for loc in locations])
    species_list = ", ".join(["%s (ID: %d)" % (sp.SPECIESNAME, sp.ID) for sp in species])

    # Build death reasons context - resolve standard reasons to their IDs in this database
    death_reasons = asm3.lookups.get_deathreasons(dbo)
    reason_map = {r.REASONNAME.lower().strip(): r.ID for r in death_reasons}
    standard_reasons = ["Dead On Arrival", "Died", "Old age", "not known", "Parasite burden", "Poison", "Unknown"]
    death_parts = []
    for name in standard_reasons:
        rid = reason_map.get(name.lower().strip(), "")
        if rid:
            death_parts.append("%s (ID:%s)" % (name, rid))
    death_reason_list = ", ".join(death_parts) if death_parts else "Use get_death_reasons to look up"

    # Build observation fields context
    obs_fields = _get_observation_fields(dbo)
    obs_field_descs = []
    for f in obs_fields:
        desc = f["name"]
        if "allowed_values" in f:
            desc += ": " + "|".join(f["allowed_values"])
        if f.get("range"):
            desc += " [range: %s]" % f["range"]
        obs_field_descs.append(desc)
    obs_fields_str = "; ".join(obs_field_descs) if obs_field_descs else "None configured"

    prompt = (
        "You are a concise AI assistant for %s (animal shelter). "
        "Today: %s. User: %s.\n\n"
        "RULES:\n"
        "- Keep ALL responses SHORT - 1-3 sentences max.\n"
        "- Do NOT repeat data the user already knows.\n"
        "- NEVER ask the user to confirm - the system shows a confirmation box automatically.\n"
        "- When viewing an animal, use that animal's ID directly - do NOT call search_animal.\n"
        "- When search returns results and one matches the current animal, use it without asking.\n"
        "- Use only ONE tool call when possible. Avoid chaining lookups.\n\n"
        "Locations: %s\nSpecies: %s\n\n"
        "Death reasons: %s\n"
        "Observation fields: %s\n\n"
        "WORKFLOWS:\n"
        "- Movements: ask for animal, type, date, and who is performing/receiving. Search person by name.\n"
        "- Death: ask for animal, date, reason (from list above). Default put_to_sleep=no.\n"
        "- Observations: prompt for each field (values above). "
        "If Eaten=None/Drunk=None/Unusual Symptoms noted: ask about poo sample. "
        "If Toilet=None: ask if clinician notified.\n"
        "- Use YYYY-MM-DD for dates. Search by name before acting.\n\n"
        "HEALTH & WEIGHT ANALYSIS:\n"
        "When asked 'tell me about X' or general animal queries, get_animal_details returns arrival_weight_g and current_weight_g (from latest observation). "
        "Mention both: 'arrived at Xg, now Yg'. After giving the summary, offer: 'Would you like me to drill down into the weight history?'\n"
        "When asked 'how is X doing?', 'weight gain?', or anything about health/progress, "
        "call get_weight_history and provide a concise clinical summary.\n"
        "Guidelines for hedgehog weight interpretation:\n"
        "- Healthy adult hedgehog: 450-700g. Underweight: <400g. Overweight: >800g.\n"
        "- Hoglets should gain ~10-15g/day when thriving.\n"
        "- Juveniles/adults in rehab should show steady gain toward release weight (550-650g).\n"
        "- Weight loss of >10%% over a week is concerning and should be flagged.\n"
        "- Small dips (5-10g) day-to-day are normal. Consistent decline over 3+ days is a worry.\n"
        "- In autumn (Sep-Nov) hedgehogs should be gaining for hibernation. Target >600g before winter.\n"
        "- In winter (Dec-Feb) some weight loss is expected during/after hibernation.\n"
        "- Spring (Mar-Apr) animals may be underweight post-hibernation - steady gain expected.\n"
        "- Always note: current weight, overall trend, recent trend, avg daily change, and any concerns.\n"
        "- If weight is dropping, suggest: check food intake, look for signs of illness, consider vet review.\n"
    ) % (org, today, username, location_list, species_list, death_reason_list, obs_fields_str)

    # Add page context if available
    if context and context.get("type"):
        if context["type"] == "animal":
            prompt += (
                "\nThe user is currently viewing animal: %s (ID: %s, Code: %s, Species: %s, Location: %s).\n"
                "When they refer to 'this animal' or don't specify which animal, assume they mean this one. "
                "Do NOT ask which animal - just use this one directly.\n"
            ) % (
                context.get("name", "Unknown"),
                context.get("id", ""),
                context.get("code", ""),
                context.get("species", ""),
                context.get("location", "")
            )
        elif context["type"] == "person":
            prompt += (
                "\nThe user is currently viewing person: %s (ID: %s).\n"
                "When they refer to 'this person' or don't specify, assume they mean this one.\n"
            ) % (context.get("name", "Unknown"), context.get("id", ""))

    # Inform AI about location restrictions
    locationfilter = getattr(session, "locationfilter", "") or ""
    if locationfilter:
        # Resolve location filter IDs to names
        filter_locs = []
        for loc_id in locationfilter.split(","):
            loc_id = loc_id.strip()
            if loc_id and not loc_id.startswith("-"):
                for loc in locations:
                    if str(loc.ID) == loc_id:
                        filter_locs.append(loc.LOCATIONNAME)
        if filter_locs:
            prompt += (
                "\nIMPORTANT: This user can only access animals in the following locations: %s. "
                "Do not attempt to look up or provide information about animals in other locations. "
                "If a search returns no results, the animal may exist but be outside the user's "
                "assigned locations.\n"
            ) % ", ".join(filter_locs)

    # Add global AI context from system settings
    global_context = asm3.configuration.ai_context(dbo)
    if global_context:
        prompt += "\nShelter-wide instructions:\n%s\n" % global_context

    # Add role-specific AI context
    try:
        role_context = asm3.users.get_ai_context_for_user(dbo, session.userid)
        if role_context:
            prompt += "\nRole-specific instructions:\n%s\n" % role_context
    except Exception:
        pass

    return prompt


def _today_str():
    """Return today's date as YYYY-MM-DD string."""
    return datetime.date.today().isoformat()


def _parse_date(dbo, datestr):
    """Parse a YYYY-MM-DD string into a Python datetime, or return today."""
    if not datestr:
        return datetime.datetime.today()
    try:
        return datetime.datetime.strptime(datestr, "%Y-%m-%d")
    except ValueError:
        return datetime.datetime.today()


def _make_post(data, locale="en"):
    """Create a PostedData object from a dict."""
    # Ensure all values are strings as PostedData expects
    str_data = {}
    for k, v in data.items():
        str_data[k] = str(v) if v is not None else ""
    return asm3.utils.PostedData(str_data, locale)


# --- Tool handler functions ---

def _get_location_filter(session):
    """Build a LocationFilter from the session, respecting Low Access Volunteer restrictions."""
    return asm3.animal.LocationFilter(
        getattr(session, "locationfilter", "") or "",
        getattr(session, "siteid", 0) or 0,
        getattr(session, "visibleanimalids", "") or ""
    )


def _check_animal_visible(session, a):
    """Check if an animal is visible to this user given their location filter. Returns True if visible."""
    lf = _get_location_filter(session)
    return lf.match(a)


def handle_search_animal(dbo, session, params):
    query = params.get("query", "")
    lf = _get_location_filter(session)
    results = asm3.animal.get_animal_find_simple(dbo, query, limit=20, lf=lf)
    animals = []
    for a in results:
        animals.append({
            "id": a.ID,
            "name": a.ANIMALNAME,
            "code": a.SHELTERCODE,
            "species": a.SPECIESNAME,
            "breed": a.BREEDNAME,
            "sex": a.SEXNAME,
            "location": a.SHELTERLOCATIONNAME if hasattr(a, "SHELTERLOCATIONNAME") else "",
            "age": a.ANIMALAGE if hasattr(a, "ANIMALAGE") else ""
        })
    return {"animals": animals, "count": len(animals)}


def _get_latest_observation_weight(dbo, animal_id):
    """Get the most recent weight from observation/behave logs. Returns (weight_g, date_str) or (0, "")."""
    behave_log_type = asm3.configuration.cint(dbo, "BehaveLogType", 3)
    obs_logs = asm3.log.get_logs(dbo, asm3.log.ANIMAL, animal_id, behave_log_type, asm3.log.DESCENDING)
    for log_entry in obs_logs:
        comment = log_entry.COMMENTS or ""
        for pair in comment.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                if k.strip().lower() == "weight":
                    w = _parse_weight_value(v)
                    if w > 0:
                        datestr = str(log_entry.DATE.date()) if log_entry.DATE else ""
                        return (round(w, 1), datestr)
    return (0, "")


def handle_get_animal_details(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}

    # Get latest weight from observations (the real current weight)
    obs_weight, obs_weight_date = _get_latest_observation_weight(dbo, animal_id)
    arrival_weight = float(a.WEIGHT) if a.WEIGHT else 0

    result = {
        "id": a.ID,
        "name": a.ANIMALNAME,
        "code": a.SHELTERCODE,
        "species": a.SPECIESNAME,
        "breed": a.BREEDNAME,
        "sex": a.SEXNAME,
        "age": a.ANIMALAGE,
        "location": a.SHELTERLOCATIONNAME,
        "arrival_weight_g": arrival_weight,
        "microchip": a.IDENTICHIPNUMBER or "",
        "markings": a.MARKINGS or "",
        "comments": a.ANIMALCOMMENTS or "",
        "health_problems": a.HEALTHPROBLEMS or "",
        "date_brought_in": str(a.DATEBROUGHTIN) if a.DATEBROUGHTIN else "",
        "date_of_birth": str(a.DATEOFBIRTH) if a.DATEOFBIRTH else ""
    }

    if obs_weight > 0:
        result["current_weight_g"] = obs_weight
        result["current_weight_date"] = obs_weight_date
    else:
        result["current_weight_g"] = arrival_weight
        result["current_weight_date"] = result["date_brought_in"]

    return result


def handle_add_animal(dbo, session, params):
    today_disp = datetime.datetime.today().strftime("%m/%d/%Y")
    data = {
        "animalname": params.get("name", ""),
        "species": str(params.get("species_id", "1")),
        "animaltype": str(params.get("animal_type_id", "1")),
        "breed1": str(params.get("breed_id", "1")),
        "breed2": str(params.get("breed_id", "1")),
        "sex": str(params.get("sex", "2")),
        "basecolour": str(params.get("colour_id", "1")),
        "internallocation": str(params.get("internal_location_id", "1")),
        "entryreason": str(params.get("entry_reason_id", "1")),
        "entrytype": "1",
        "datebroughtin": today_disp,
        "markings": params.get("markings", ""),
        "comments": params.get("comments", ""),
        "microchipnumber": params.get("microchip", ""),
    }
    if params.get("estimated_age"):
        data["estimatedage"] = params["estimated_age"]
    elif params.get("date_of_birth"):
        data["dateofbirth"] = params["date_of_birth"]
    else:
        data["estimatedage"] = "1"

    post = _make_post(data, session.locale)
    animal_id, code = asm3.animal.insert_animal_from_form(dbo, post, session.user)
    return {"animal_id": animal_id, "code": code, "message": "Animal '%s' created with code %s" % (params.get("name"), code)}


def handle_update_weight(dbo, session, params):
    animal_id = params.get("animal_id")
    weight = params.get("weight", 0)
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    dbo.update("animal", animal_id, {"Weight": weight}, session.user)
    return {"animal_id": animal_id, "weight": weight, "message": "Weight updated to %sg for %s" % (weight, a.ANIMALNAME)}


def _parse_weight_value(text):
    """Parse a weight value from text like '650g', '650 g', '0.65 kg', '650'. Returns grams or 0."""
    import re
    text = text.strip().rstrip("g")  # handle "650g" -> "650"
    parts = text.strip().split()
    if not parts:
        return 0
    try:
        val = float(parts[0])
    except (ValueError, IndexError):
        return 0
    if len(parts) > 1:
        unit = parts[1].lower().rstrip("s")
        if unit == "kg":
            val = val * 1000
        elif unit == "lb":
            val = val * 453.592
    return val


def handle_get_weight_history(dbo, session, params):
    """Get weight history from weight change logs AND observation/behave logs."""
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}

    entries = []  # list of {"date": "YYYY-MM-DD", "weight_g": float, "source": str}
    seen_dates = set()  # avoid duplicates on same date

    # 1) Weight change log entries
    weight_log_type = asm3.configuration.weight_change_log_type(dbo)
    weight_logs = asm3.log.get_logs(dbo, asm3.log.ANIMAL, animal_id, weight_log_type, asm3.log.ASCENDING)
    for log_entry in weight_logs:
        datestr = str(log_entry.DATE.date()) if log_entry.DATE else ""
        comment = log_entry.COMMENTS or ""
        weight_val = _parse_weight_value(comment)
        if weight_val > 0 and datestr:
            entries.append({"date": datestr, "weight_g": round(weight_val, 1), "source": "weight_log"})
            seen_dates.add(datestr)

    # 2) Observation/behave log entries (packed format: "Weight=650g, Eaten=All, ...")
    behave_log_type = asm3.configuration.cint(dbo, "BehaveLogType", 3)
    obs_logs = asm3.log.get_logs(dbo, asm3.log.ANIMAL, animal_id, behave_log_type, asm3.log.ASCENDING)
    for log_entry in obs_logs:
        datestr = str(log_entry.DATE.date()) if log_entry.DATE else ""
        comment = log_entry.COMMENTS or ""
        # Parse packed key=value pairs
        weight_val = 0
        for pair in comment.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                if k.strip().lower() == "weight":
                    weight_val = _parse_weight_value(v)
                    break
        if weight_val > 0 and datestr and datestr not in seen_dates:
            entries.append({"date": datestr, "weight_g": round(weight_val, 1), "source": "observation"})
            seen_dates.add(datestr)

    # Sort by date ascending
    entries.sort(key=lambda e: e["date"])

    # Current weight on animal record
    current_weight = float(a.WEIGHT) if a.WEIGHT else 0

    # Build result with trend analysis
    result = {
        "animal_name": a.ANIMALNAME,
        "species": a.SPECIESNAME,
        "current_weight_g": current_weight,
        "date_brought_in": str(a.DATEBROUGHTIN.date()) if a.DATEBROUGHTIN else "",
        "date_of_birth": str(a.DATEOFBIRTH.date()) if a.DATEOFBIRTH else "",
        "entries": entries,
        "entry_count": len(entries),
    }

    if len(entries) >= 2:
        first = entries[0]
        last = entries[-1]
        total_change = last["weight_g"] - first["weight_g"]
        result["first_recorded"] = first
        result["latest_recorded"] = last
        result["total_change_g"] = round(total_change, 1)
        result["trend"] = "gaining" if total_change > 0 else ("losing" if total_change < 0 else "stable")

        # Calculate daily average change
        try:
            d1 = datetime.datetime.strptime(first["date"], "%Y-%m-%d")
            d2 = datetime.datetime.strptime(last["date"], "%Y-%m-%d")
            days = (d2 - d1).days
            if days > 0:
                result["days_tracked"] = days
                result["avg_daily_change_g"] = round(total_change / days, 1)
        except (ValueError, ZeroDivisionError):
            pass

        # Recent trend (last 7 entries)
        if len(entries) >= 3:
            recent = entries[-min(7, len(entries)):]
            recent_change = recent[-1]["weight_g"] - recent[0]["weight_g"]
            result["recent_change_g"] = round(recent_change, 1)
            result["recent_trend"] = "gaining" if recent_change > 0 else ("losing" if recent_change < 0 else "stable")

        # Flag consecutive declines
        if len(entries) >= 3:
            consecutive_drops = 0
            for i in range(len(entries) - 1, 0, -1):
                if entries[i]["weight_g"] < entries[i-1]["weight_g"]:
                    consecutive_drops += 1
                else:
                    break
            if consecutive_drops >= 2:
                result["warning"] = "Weight has dropped for %d consecutive recordings" % consecutive_drops

    elif len(entries) == 1:
        result["first_recorded"] = entries[0]
        result["latest_recorded"] = entries[0]
        result["trend"] = "insufficient data - only 1 weight recorded"

    else:
        result["trend"] = "no weight history found"

    return result


def handle_move_animal(dbo, session, params):
    animal_id = params.get("animal_id")
    location_id = params.get("location_id")
    unit = params.get("unit", "")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    asm3.animal.update_location_unit(dbo, session.user, animal_id, location_id, unit)
    loc = dbo.query_string("SELECT LocationName FROM internallocation WHERE ID=?", [location_id])
    return {"animal_id": animal_id, "location": loc, "message": "Moved %s to %s" % (a.ANIMALNAME, loc)}


def _get_observation_fields(dbo):
    """Read configured observation fields from Behave settings."""
    fields = []
    for i in range(1, 51):
        name = asm3.configuration.cstring(dbo, "Behave%dName" % i)
        if not name:
            continue
        values = asm3.configuration.cstring(dbo, "Behave%dValues" % i)
        required = asm3.configuration.cstring(dbo, "Behave%dRequired" % i).lower() == "yes"
        range_str = asm3.configuration.cstring(dbo, "Behave%dRange" % i)
        field = {"name": name, "required": required}
        if values:
            field["allowed_values"] = values.split("|")
        if range_str and "-" in range_str:
            field["range"] = range_str
        fields.append(field)
    return fields


def handle_get_observation_fields(dbo, session, params):
    fields = _get_observation_fields(dbo)
    return {
        "fields": fields,
        "notes": [
            "If Eaten=None or Drunk=None or Unusual Symptoms has a value: ask about poo sample (Yes/No)",
            "If Toilet=None or no sign of animal: ask whether clinician was notified (Yes/No)"
        ]
    }


def handle_add_observation(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}

    observations = params.get("observations", {})
    if not observations:
        return {"error": "No observation values provided"}

    # Validate against configured fields
    fields = _get_observation_fields(dbo)
    field_map = {f["name"].lower(): f for f in fields}
    for f in fields:
        if f["required"]:
            val = None
            for k, v in observations.items():
                if k.lower() == f["name"].lower():
                    val = v
                    break
            if not val or str(val).strip() == "":
                return {"error": "Field '%s' is required" % f["name"]}

    # Validate allowed values and ranges
    for k, v in observations.items():
        fl = field_map.get(k.lower())
        if fl and "allowed_values" in fl:
            if str(v) not in fl["allowed_values"]:
                return {"error": "Invalid value '%s' for field '%s'. Allowed: %s" % (v, k, ", ".join(fl["allowed_values"]))}
        if fl and "range" in fl:
            parts = fl["range"].split("-")
            try:
                lo, hi = float(parts[0]), float(parts[1])
                fv = float(v)
                if fv < lo or fv > hi:
                    return {"error": "Value %s for '%s' is outside range %s" % (v, k, fl["range"])}
            except (ValueError, IndexError):
                pass

    # Check poo sample triggers
    # Check trigger conditions from observation values
    eaten = ""
    drunk = ""
    unusual = ""
    toilet = ""
    poo_inspection = ""
    for k, v in observations.items():
        kl = k.lower()
        if kl == "eaten": eaten = str(v).lower()
        elif kl == "drunk": drunk = str(v).lower()
        elif kl == "unusual symptoms": unusual = str(v).strip()
        elif kl == "toilet": toilet = str(v).lower()
        elif kl == "poo inspection": poo_inspection = str(v).strip()

    poo_triggered = eaten == "none" or drunk == "none" or unusual != "" or poo_inspection in ("7", "8")
    clinician_triggered = toilet == "none"

    # If triggers fired but user hasn't answered yet, return error so AI asks
    if poo_triggered and not params.get("poo_sample"):
        return {"error": "Poo sample question triggered. Ask the user: should a poo sample be taken? Then pass poo_sample=Yes or poo_sample=No."}
    if clinician_triggered and not params.get("clinician_notified"):
        return {"error": "Clinician notification triggered (Toilet=None). Ask the user: has the clinician been notified? Then pass clinician_notified=Yes or clinician_notified=No."}

    # Build packed observation string (skip Poo Sample Taken? and Clinician Alerted? from user input - we add them below)
    parts = []
    skip_keys = {"poo sample taken?", "clinician alerted?"}
    for k, v in observations.items():
        if k.lower() not in skip_keys:
            parts.append("%s=%s" % (k, v))
    if poo_triggered:
        parts.append("Poo Sample Taken?=%s" % params.get("poo_sample", "No"))
    if clinician_triggered:
        parts.append("Clinician Alerted?=%s" % params.get("clinician_notified", "No"))
    packed = ", ".join(parts)

    # Save as log entry using the configured observation log type
    logtype = asm3.configuration.cint(dbo, "BehaveLogType", 3)
    log_id = asm3.log.add_log(dbo, session.user, asm3.log.ANIMAL, animal_id, logtype, packed)
    return {"log_id": log_id, "message": "Observation recorded for %s" % a.ANIMALNAME}


def handle_add_log(dbo, session, params):
    animal_id = params.get("animal_id")
    comments = params.get("comments", "")
    log_type_id = params.get("log_type_id", 1)
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    log_id = asm3.log.add_log(dbo, session.user, asm3.log.ANIMAL, animal_id, log_type_id, comments)
    return {"log_id": log_id, "message": "Log entry added"}


def handle_add_vaccination(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    today_disp = datetime.datetime.today().strftime("%m/%d/%Y")
    date_given = params.get("date_given", "")
    if date_given:
        try:
            dt = datetime.datetime.strptime(date_given, "%Y-%m-%d")
            date_given = dt.strftime("%m/%d/%Y")
        except ValueError:
            date_given = today_disp
    else:
        date_given = today_disp

    data = {
        "animal": str(params.get("animal_id", "")),
        "type": str(params.get("vaccination_type_id", "")),
        "required": today_disp,
        "given": date_given,
        "batchnumber": params.get("batch_number", ""),
        "manufacturer": params.get("manufacturer", ""),
        "comments": params.get("comments", ""),
    }
    post = _make_post(data, session.locale)
    vacc_id = asm3.medical.insert_vaccination_from_form(dbo, session.user, post)
    return {"vaccination_id": vacc_id, "message": "Vaccination recorded"}


def handle_add_test(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    today_disp = datetime.datetime.today().strftime("%m/%d/%Y")
    date_of_test = params.get("date_of_test", "")
    if date_of_test:
        try:
            dt = datetime.datetime.strptime(date_of_test, "%Y-%m-%d")
            date_of_test = dt.strftime("%m/%d/%Y")
        except ValueError:
            date_of_test = today_disp
    else:
        date_of_test = today_disp

    data = {
        "animal": str(params.get("animal_id", "")),
        "type": str(params.get("test_type_id", "")),
        "result": str(params.get("result_id", "")),
        "required": today_disp,
        "given": date_of_test,
        "comments": params.get("comments", ""),
    }
    post = _make_post(data, session.locale)
    test_id = asm3.medical.insert_test_from_form(dbo, session.user, post)
    return {"test_id": test_id, "message": "Test result recorded"}


def handle_add_medical_treatment(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}
    today_disp = datetime.datetime.today().strftime("%m/%d/%Y")
    start_date = params.get("start_date", "")
    if start_date:
        try:
            dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
            start_date = dt.strftime("%m/%d/%Y")
        except ValueError:
            start_date = today_disp
    else:
        start_date = today_disp

    data = {
        "animal": str(params.get("animal_id", "")),
        "startdate": start_date,
        "treatmentname": params.get("treatment_name", ""),
        "dosage": params.get("dosage", ""),
        "comments": params.get("comments", ""),
        "timingrule": "1",
        "timingrulefrequency": "1",
        "timingrulenofrequencies": "1",
        "singlemulti": "0",
        "treatmentrule": "0",
        "totalnumberoftreatments": "1",
    }
    post = _make_post(data, session.locale)
    regimen_id = asm3.medical.insert_regimen_from_form(dbo, session.user, post)
    return {"regimen_id": regimen_id, "message": "Medical treatment '%s' added" % params.get("treatment_name", "")}


def handle_add_diary(dbo, session, params):
    diary_date_str = params.get("diary_date", "")
    diary_date = _parse_date(dbo, diary_date_str)
    animal_id = params.get("animal_id", 0)
    link_type = asm3.diary.ANIMAL if animal_id else 0
    link_id = animal_id if animal_id else 0

    diary_id = asm3.diary.insert_diary(
        dbo, session.user, link_type, link_id,
        diary_date, session.user,
        params.get("subject", ""),
        params.get("note", "")
    )
    return {"diary_id": diary_id, "message": "Diary entry created"}


def handle_search_person(dbo, session, params):
    query = params.get("query", "")
    results = asm3.person.get_person_find_simple(dbo, query, limit=20)
    people = []
    for p in results:
        people.append({
            "id": p.ID,
            "name": p.OWNERNAME,
            "address": p.OWNERADDRESS or "",
            "town": p.OWNERTOWN or "",
            "phone": p.HOMETELEPHONE or p.MOBILETELEPHONE or "",
            "email": p.EMAILADDRESS or ""
        })
    return {"people": people, "count": len(people)}


def handle_get_locations(dbo, session, params):
    locations = asm3.lookups.get_internal_locations(dbo)
    return {"locations": [{"id": loc.ID, "name": loc.LOCATIONNAME} for loc in locations]}


def handle_get_species(dbo, session, params):
    species = asm3.lookups.get_species(dbo)
    return {"species": [{"id": sp.ID, "name": sp.SPECIESNAME} for sp in species]}


def handle_get_breeds(dbo, session, params):
    breeds = asm3.lookups.get_breeds_by_species(dbo)
    species_id = params.get("species_id")
    if species_id:
        breeds = [b for b in breeds if b.SPECIESID == species_id]
    return {"breeds": [{"id": b.ID, "name": b.BREEDNAME, "species_id": b.SPECIESID} for b in breeds]}


def handle_get_vaccination_types(dbo, session, params):
    vt = asm3.lookups.get_vaccination_types(dbo)
    return {"vaccination_types": [{"id": v.ID, "name": v.VACCINATIONTYPE} for v in vt]}


def handle_get_test_types(dbo, session, params):
    tt = asm3.lookups.get_test_types(dbo)
    return {"test_types": [{"id": t.ID, "name": t.TESTNAME} for t in tt]}


def handle_create_movement(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}

    movement_type = params.get("movement_type")
    person_id = params.get("person_id", 0) or 0
    # Person is required for adoption, foster, transfer, reclaimed
    needs_person = movement_type in (asm3.movement.ADOPTION, asm3.movement.FOSTER,
                                      asm3.movement.TRANSFER, asm3.movement.RECLAIMED)
    if needs_person and not person_id:
        type_names = {1: "Adoption", 2: "Foster", 3: "Transfer", 5: "Reclaim"}
        return {"error": "%s requires a person. Search for the person first and provide person_id." % type_names.get(movement_type, "This movement")}

    today_disp = datetime.datetime.today().strftime("%m/%d/%Y")
    movement_date = params.get("movement_date", "")
    if movement_date:
        try:
            dt = datetime.datetime.strptime(movement_date, "%Y-%m-%d")
            movement_date = dt.strftime("%m/%d/%Y")
        except ValueError:
            movement_date = today_disp
    else:
        movement_date = today_disp

    data = {
        "animal": str(animal_id),
        "person": str(person_id),
        "type": str(movement_type),
        "movementdate": movement_date,
        "comments": params.get("comments", ""),
    }
    post = _make_post(data, session.locale)
    movement_id = asm3.movement.insert_movement_from_form(dbo, session.user, post)

    type_names = {1: "Adoption", 2: "Foster", 3: "Transfer", 4: "Escaped",
                  5: "Reclaimed", 6: "Stolen", 7: "Released to wild", 8: "Retailer"}
    type_name = type_names.get(movement_type, "Movement")
    return {"movement_id": movement_id, "message": "%s recorded for %s" % (type_name, a.ANIMALNAME)}


def handle_record_death(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    if not _check_animal_visible(session, a):
        return {"error": "You do not have access to this animal. It is not in your assigned location."}

    deceased_date = params.get("deceased_date", "")
    if not deceased_date:
        return {"error": "deceased_date is required (YYYY-MM-DD)"}
    try:
        dt = datetime.datetime.strptime(deceased_date, "%Y-%m-%d")
        deceased_date_disp = dt.strftime("%m/%d/%Y")
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD."}

    data = {
        "animal": str(animal_id),
        "deceaseddate": deceased_date_disp,
        "deathcategory": str(params.get("death_reason_id", "")),
        "puttosleep": "1" if params.get("put_to_sleep") else "0",
        "deadonarrival": "1" if params.get("dead_on_arrival") else "0",
        "ptsreason": params.get("comments", ""),
    }
    post = _make_post(data, session.locale)
    asm3.animal.update_deceased_from_form(dbo, session.user, post)
    return {"animal_id": animal_id, "message": "Death recorded for %s on %s" % (a.ANIMALNAME, deceased_date)}


def handle_get_movement_types(dbo, session, params):
    types = [
        {"id": 1, "name": "Adoption"},
        {"id": 2, "name": "Foster"},
        {"id": 3, "name": "Transfer"},
        {"id": 4, "name": "Escaped"},
        {"id": 5, "name": "Reclaimed"},
        {"id": 6, "name": "Stolen"},
        {"id": 7, "name": "Released to wild"},
        {"id": 8, "name": "Retailer"},
    ]
    return {"movement_types": types}


def handle_get_death_reasons(dbo, session, params):
    reasons = asm3.lookups.get_deathreasons(dbo)
    return {"death_reasons": [{"id": r.ID, "name": r.REASONNAME} for r in reasons]}


def handle_navigate_to(dbo, session, params):
    url = params.get("url", "")
    return {"navigate": url, "message": "Navigating to %s" % url}


def handle_list_reports(dbo, session, params):
    reports = asm3.reports.get_reports(dbo)
    search = params.get("search", "").lower()
    result = []
    for r in reports:
        # Skip mail merges
        if r.HTMLBODY and r.HTMLBODY.startswith("MAIL"):
            continue
        # Filter by search term if provided
        if search and search not in r.TITLE.lower() and search not in (r.CATEGORY or "").lower():
            continue
        # Check if report has parameters
        has_params = False
        try:
            crit = asm3.reports.Report(dbo).GetParams(r.ID)
            has_params = len(crit) > 0
        except Exception:
            pass
        result.append({
            "id": r.ID,
            "title": r.TITLE,
            "category": r.CATEGORY,
            "has_parameters": has_params
        })
    return {"reports": result, "count": len(result)}


def handle_run_report(dbo, session, params):
    report_id = params.get("report_id")
    if not report_id:
        return {"error": "report_id is required"}
    # Check report has parameters - if so, send to criteria page, otherwise direct to report
    try:
        crit = asm3.reports.Report(dbo).GetParams(report_id)
    except Exception:
        crit = []
    if crit:
        url = "report_criteria?id=%s&target=report" % report_id
    else:
        url = "report?id=%s" % report_id
    title = dbo.query_string("SELECT Title FROM customreport WHERE ID=?", [report_id])
    return {"navigate": url, "message": "Opening report: %s" % title}



# Map tool names to handler functions
TOOL_HANDLERS = {
    "search_animal": handle_search_animal,
    "get_animal_details": handle_get_animal_details,
    "add_animal": handle_add_animal,
    "update_weight": handle_update_weight,
    "get_weight_history": handle_get_weight_history,
    "move_animal": handle_move_animal,
    "add_observation": handle_add_observation,
    "get_observation_fields": handle_get_observation_fields,
    "add_log": handle_add_log,
    "add_vaccination": handle_add_vaccination,
    "add_test": handle_add_test,
    "add_medical_treatment": handle_add_medical_treatment,
    "add_diary": handle_add_diary,
    "search_person": handle_search_person,
    "get_locations": handle_get_locations,
    "get_species": handle_get_species,
    "get_breeds": handle_get_breeds,
    "get_vaccination_types": handle_get_vaccination_types,
    "get_test_types": handle_get_test_types,
    "list_reports": handle_list_reports,
    "run_report": handle_run_report,
    "create_movement": handle_create_movement,
    "record_death": handle_record_death,
    "get_movement_types": handle_get_movement_types,
    "get_death_reasons": handle_get_death_reasons,
    "navigate_to": handle_navigate_to,
}


def execute_tool(dbo, session, tool_name, tool_input):
    """Execute a tool call, respecting permissions and returning structured results."""
    tool = get_tool_by_name(tool_name)
    if tool is None:
        return {"error": "Unknown tool: %s" % tool_name}

    # Verify permission (defense in depth) - skip for tools with no permission requirement
    if tool["permission"] != "":
        asm3.users.check_permission(session, tool["permission"])

    # Get and call the handler
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        return {"error": "No handler for tool: %s" % tool_name}

    result = handler(dbo, session, tool_input)

    # Audit log for write operations
    if tool["confirm"] != CONFIRM_NONE:
        asm3.al.info("AI tool executed by %s: %s with params: %s" % (session.user, tool_name, json.dumps(tool_input)),
            "ai_assistant.%s" % tool_name, dbo)

    return result


def chat(dbo, session, message, history=None, context=None):
    """
    Process a chat message through an AI provider with tool use.

    Args:
        dbo: Database object
        session: User session (for permissions)
        message: User's text message
        history: List of previous messages in provider-specific format
        context: Dict with page context {type, id, name, code, species, location}

    Returns:
        Dict with response text, any pending actions, and updated history
    """
    if not AI_API_KEY:
        return {
            "text": "AI assistant is not configured. Please set the AI API key in the system configuration.",
            "requires_confirmation": False,
            "history": []
        }

    from asm3.ai_providers import get_provider
    provider = get_provider()

    raw_tools = get_available_tools(session)
    tools = provider.convert_tools(raw_tools)
    system_prompt = build_system_prompt(dbo, session, context)

    if history is None:
        history = []

    # Log the user's message and available tools
    available_tool_names = [t["name"] for t in raw_tools]
    asm3.al.info("AI chat from %s (tools: %s): %s" % (session.user, ",".join(available_tool_names), message),
        "ai_assistant.chat", dbo)

    messages = history + [{"role": "user", "content": message}]

    response = provider.chat(system_prompt, messages, tools)

    # Track usage across the tool loop
    total_input_tokens = response.input_tokens
    total_output_tokens = response.output_tokens
    model_used = response.model

    # Track navigation and entity links from tool results
    navigate_url = None
    entity_links = []

    # Handle tool use loop
    max_iterations = 10
    iterations = 0
    while response.stop_reason == "tool_use" and iterations < max_iterations:
        iterations += 1

        if not response.tool_calls:
            break

        # Check if any tool call requires confirmation
        for tc in response.tool_calls:
            tool_def = get_tool_by_name(tc["name"])
            if tool_def and tool_def["confirm"] != CONFIRM_NONE:
                asm3.al.info("AI requesting confirmation for %s: %s" % (tc["name"], json.dumps(tc["input"])),
                    "ai_assistant.chat", dbo)
                assistant_msg = provider.serialize_assistant_message(response)
                return {
                    "text": response.text,
                    "pending_action": {
                        "tool": tc["name"],
                        "params": tc["input"],
                        "tool_use_id": tc["id"],
                        "description": _describe_action(tc["name"], tc["input"], dbo)
                    },
                    "requires_confirmation": True,
                    "history": messages + [assistant_msg]
                }

        # Execute ALL tool calls (OpenAI can return multiple per response)
        messages.append(provider.serialize_assistant_message(response))
        for tc in response.tool_calls:
            asm3.al.info("AI tool call by %s: %s(%s)" % (session.user, tc["name"], json.dumps(tc["input"])),
                "ai_assistant.chat", dbo)
            try:
                result = execute_tool(dbo, session, tc["name"], tc["input"])
            except asm3.utils.ASMPermissionError:
                result = {"error": "Permission denied: you do not have access to %s" % tc["name"]}
                asm3.al.warn("AI tool %s denied for %s: insufficient permissions" % (tc["name"], session.user),
                    "ai_assistant.chat", dbo)
            except Exception as e:
                result = {"error": str(e)}
            messages.append(provider.make_tool_result_message(tc["id"], result))

            # Capture navigation from tools that return navigate URLs
            if "navigate" in result:
                navigate_url = result["navigate"]

            # Capture entity links from search results
            _collect_entity_links(tc["name"], result, entity_links)

        response = provider.chat(system_prompt, messages, tools)
        total_input_tokens += response.input_tokens
        total_output_tokens += response.output_tokens

    # Log the final AI response with model and token usage
    response_text = response.text or ""
    if len(response_text) > 500:
        log_text = response_text[:500] + "..."
    else:
        log_text = response_text
    asm3.al.info("AI response to %s [model=%s, tokens=%d in/%d out]: %s" % (
        session.user, model_used, total_input_tokens, total_output_tokens, log_text),
        "ai_assistant.chat", dbo)

    # Final text response
    assistant_msg = provider.serialize_assistant_message(response)
    final_history = messages + [assistant_msg]

    result = {
        "text": response_text,
        "requires_confirmation": False,
        "history": final_history
    }
    if navigate_url:
        result["navigate"] = navigate_url
    if entity_links:
        result["entity_links"] = entity_links
    return result


def _collect_entity_links(tool_name, result, links):
    """Extract entity links from tool results for clickable display."""
    if tool_name == "search_animal" and "animals" in result:
        for a in result["animals"]:
            links.append({"type": "animal", "id": a["id"], "name": a["name"],
                          "url": "animal?id=%s" % a["id"]})
    elif tool_name == "get_animal_details" and "id" in result:
        links.append({"type": "animal", "id": result["id"], "name": result["name"],
                      "url": "animal?id=%s" % result["id"]})
    elif tool_name == "search_person" and "people" in result:
        for p in result["people"]:
            links.append({"type": "person", "id": p["id"], "name": p["name"],
                          "url": "person?id=%s" % p["id"]})
    elif tool_name == "add_animal" and "animal_id" in result:
        links.append({"type": "animal", "id": result["animal_id"],
                      "name": result.get("code", ""),
                      "url": "animal?id=%s" % result["animal_id"]})


def _describe_action(tool_name, params, dbo=None):
    """Generate a human-readable description of a proposed action."""
    # Look up animal/person names for friendlier descriptions
    animal_name = ""
    if dbo and params.get("animal_id"):
        animal_name = dbo.query_string("SELECT AnimalName FROM animal WHERE ID=?", [params["animal_id"]]) or ""
    animal_label = animal_name if animal_name else ("animal ID %s" % params.get("animal_id", "?"))

    location_name = ""
    if dbo and params.get("location_id"):
        location_name = dbo.query_string("SELECT LocationName FROM internallocation WHERE ID=?", [params["location_id"]]) or ""
    location_label = location_name if location_name else ("location ID %s" % params.get("location_id", "?"))

    type_names = {1: "Adoption", 2: "Foster", 3: "Transfer", 4: "Escaped",
                  5: "Reclaimed", 6: "Stolen", 7: "Released to wild", 8: "Retailer"}

    descriptions = {
        "add_animal": "Register new animal: %s" % params.get("name", ""),
        "update_weight": "Update weight to %sg for %s" % (params.get("weight", ""), animal_label),
        "move_animal": "Move %s to %s" % (animal_label, location_label),
        "add_vaccination": "Record vaccination for %s" % animal_label,
        "add_test": "Record test result for %s" % animal_label,
        "add_medical_treatment": "Add treatment '%s' for %s" % (params.get("treatment_name", ""), animal_label),
        "add_diary": "Create diary entry: %s" % params.get("subject", ""),
        "create_movement": "%s for %s on %s" % (
            type_names.get(params.get("movement_type", 0), "Movement"),
            animal_label,
            params.get("movement_date", "today")),
        "record_death": "Record death of %s on %s" % (animal_label, params.get("deceased_date", "")),
        "add_observation": "Save daily observation for %s" % animal_label,
    }
    return descriptions.get(tool_name, "Execute %s" % tool_name)


def extract_animal_data(dbo, session, transcript):
    """Use AI to extract structured animal data from a voice transcript.
    Returns a dict of field values suitable for populating the induction form."""
    from asm3.ai_providers import get_provider
    provider = get_provider()

    # Build lookup context so the AI can match to valid IDs
    locations = asm3.lookups.get_internal_locations(dbo)
    species = asm3.lookups.get_species(dbo)
    breeds = asm3.lookups.get_breeds_by_species(dbo)
    colours = asm3.lookups.get_basecolours(dbo)

    location_list = ", ".join(["%s (ID:%d)" % (loc.LOCATIONNAME, loc.ID) for loc in locations])
    species_list = ", ".join(["%s (ID:%d)" % (sp.SPECIESNAME, sp.ID) for sp in species])
    breed_list = ", ".join(["%s (ID:%d, species:%d)" % (b.BREEDNAME, b.ID, b.SPECIESID) for b in breeds[:100]])
    colour_list = ", ".join(["%s (ID:%d)" % (c.BASECOLOUR, c.ID) for c in colours])

    system_prompt = (
        "You are a data extraction assistant for an animal shelter. "
        "Extract structured animal data from the voice transcript below. "
        "Return ONLY a JSON object with these fields (omit any field you cannot determine):\n"
        "- animalname: string\n"
        "- species_id: integer\n"
        "- breed_id: integer\n"
        "- sex: integer (0=Female, 1=Male, 2=Unknown)\n"
        "- colour_id: integer\n"
        "- weight: number (in grams)\n"
        "- microchip: string\n"
        "- markings: string (physical description)\n"
        "- comments: string (general notes from transcript)\n"
        "- health_problems: string (any health issues mentioned)\n"
        "- location_id: integer\n"
        "- estimated_age: string (e.g. '2 years', '6 months')\n\n"
        "Available locations: %s\n"
        "Available species: %s\n"
        "Available breeds (first 100): %s\n"
        "Available colours: %s\n\n"
        "Return ONLY valid JSON, no other text."
    ) % (location_list, species_list, breed_list, colour_list)

    messages = [{"role": "user", "content": "Extract animal data from this transcript:\n\n%s" % transcript}]

    asm3.al.info("AI extracting animal data from transcript (%d chars) for %s" % (len(transcript), session.user),
        "ai_assistant.extract", dbo)

    response = provider.chat(system_prompt, messages, [])

    # Parse the JSON response
    text = response.text or ""
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        asm3.al.warn("AI extract returned invalid JSON: %s" % text[:200], "ai_assistant.extract", dbo)
        data = {"comments": transcript}

    asm3.al.info("AI extracted fields: %s" % ", ".join(data.keys()), "ai_assistant.extract", dbo)
    return data
