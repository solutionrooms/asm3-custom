
import asm3.al
import asm3.animal
import asm3.configuration
import asm3.diary
import asm3.i18n
import asm3.log
import asm3.lookups
import asm3.medical
import asm3.person
import asm3.users
import asm3.utils

from asm3.sitedefs import AI_API_KEY, AI_MODEL, AI_MAX_TOKENS
from asm3.typehints import Database, Session

import datetime
import json
import sys

# Action confirmation tiers
CONFIRM_NONE = 0       # Read-only, execute immediately
CONFIRM_STANDARD = 1   # Write action, ask for confirmation
CONFIRM_ALWAYS = 2     # Destructive action, always confirm

TOOL_DEFINITIONS = [
    {
        "name": "search_animal",
        "description": "Search for animals by name, shelter code, microchip number, or other criteria. Returns a list of matching animals.",
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
        "name": "add_log",
        "description": "Add an observation or log note to an animal's record. Use this for quick notes and observations during examinations.",
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

    prompt = (
        "You are an AI assistant for %s, an animal shelter management system.\n"
        "Today's date is %s. The user's name is %s.\n\n"
        "You help shelter staff manage animal records using voice and text commands.\n"
        "Be concise - staff are often hands-free during examinations.\n\n"
        "Available shelter locations: %s\n\n"
        "Available species: %s\n\n"
        "When the user refers to an animal by name, use search_animal to find the correct "
        "record before taking action. If multiple matches are found, ask the user to clarify.\n\n"
        "For write operations, provide a clear summary of what you will do.\n"
        "If any required information is missing, ask the user rather than guessing.\n"
        "When specifying dates, use YYYY-MM-DD format.\n"
    ) % (org, today, username, location_list, species_list)

    # Add page context if available
    if context and context.get("type"):
        if context["type"] == "animal":
            prompt += (
                "\nThe user is currently viewing animal: %s (ID: %s, Code: %s, Species: %s, Location: %s).\n"
                "When they refer to 'this animal' or don't specify which animal, assume they mean this one.\n"
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

def handle_search_animal(dbo, session, params):
    query = params.get("query", "")
    results = asm3.animal.get_animal_find_simple(dbo, query, limit=20)
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


def handle_get_animal_details(dbo, session, params):
    animal_id = params.get("animal_id")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    return {
        "id": a.ID,
        "name": a.ANIMALNAME,
        "code": a.SHELTERCODE,
        "species": a.SPECIESNAME,
        "breed": a.BREEDNAME,
        "sex": a.SEXNAME,
        "age": a.ANIMALAGE,
        "location": a.SHELTERLOCATIONNAME,
        "weight": float(a.WEIGHT) if a.WEIGHT else 0,
        "microchip": a.IDENTICHIPNUMBER or "",
        "markings": a.MARKINGS or "",
        "comments": a.ANIMALCOMMENTS or "",
        "health_problems": a.HEALTHPROBLEMS or "",
        "date_brought_in": str(a.DATEBROUGHTIN) if a.DATEBROUGHTIN else "",
        "date_of_birth": str(a.DATEOFBIRTH) if a.DATEOFBIRTH else ""
    }


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
    dbo.update("animal", animal_id, {"Weight": weight}, session.user)
    return {"animal_id": animal_id, "weight": weight, "message": "Weight updated to %sg for %s" % (weight, a.ANIMALNAME)}


def handle_move_animal(dbo, session, params):
    animal_id = params.get("animal_id")
    location_id = params.get("location_id")
    unit = params.get("unit", "")
    a = asm3.animal.get_animal(dbo, animal_id)
    if a is None:
        return {"error": "Animal not found with ID %s" % animal_id}
    asm3.animal.update_location_unit(dbo, session.user, animal_id, location_id, unit)
    loc = dbo.query_string("SELECT LocationName FROM internallocation WHERE ID=?", [location_id])
    return {"animal_id": animal_id, "location": loc, "message": "Moved %s to %s" % (a.ANIMALNAME, loc)}


def handle_add_log(dbo, session, params):
    animal_id = params.get("animal_id")
    comments = params.get("comments", "")
    log_type_id = params.get("log_type_id", 1)
    log_id = asm3.log.add_log(dbo, session.user, asm3.log.ANIMAL, animal_id, log_type_id, comments)
    return {"log_id": log_id, "message": "Log entry added"}


def handle_add_vaccination(dbo, session, params):
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


# Map tool names to handler functions
TOOL_HANDLERS = {
    "search_animal": handle_search_animal,
    "get_animal_details": handle_get_animal_details,
    "add_animal": handle_add_animal,
    "update_weight": handle_update_weight,
    "move_animal": handle_move_animal,
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
}


def execute_tool(dbo, session, tool_name, tool_input):
    """Execute a tool call, respecting permissions and returning structured results."""
    tool = get_tool_by_name(tool_name)
    if tool is None:
        return {"error": "Unknown tool: %s" % tool_name}

    # Verify permission (defense in depth)
    asm3.users.check_permission(session, tool["permission"])

    # Get and call the handler
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        return {"error": "No handler for tool: %s" % tool_name}

    result = handler(dbo, session, tool_input)

    # Audit log for write operations
    if tool["confirm"] != CONFIRM_NONE:
        asm3.al.info(dbo, "ai_assistant.%s" % tool_name, session.user,
            "AI tool executed: %s with params: %s" % (tool_name, json.dumps(tool_input)))

    return result


def _get_text_from_response(response):
    """Extract text content from a Claude API response."""
    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def _get_tool_use_from_response(response):
    """Extract the first tool_use block from a Claude API response."""
    for block in response.content:
        if block.type == "tool_use":
            return block
    return None


def chat(dbo, session, message, history=None, context=None):
    """
    Process a chat message through Claude API with tool use.

    Args:
        dbo: Database object
        session: User session (for permissions)
        message: User's text message
        history: List of previous messages in Claude API format
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

    import anthropic
    client = anthropic.Anthropic(api_key=AI_API_KEY)

    tools = get_available_tools(session)
    system_prompt = build_system_prompt(dbo, session, context)

    if history is None:
        history = []

    messages = history + [{"role": "user", "content": message}]

    response = client.messages.create(
        model=AI_MODEL,
        max_tokens=AI_MAX_TOKENS,
        system=system_prompt,
        tools=tools,
        messages=messages
    )

    # Handle tool use loop
    max_iterations = 10
    iterations = 0
    while response.stop_reason == "tool_use" and iterations < max_iterations:
        iterations += 1
        tool_block = _get_tool_use_from_response(response)
        if tool_block is None:
            break

        tool_def = get_tool_by_name(tool_block.name)

        if tool_def and tool_def["confirm"] != CONFIRM_NONE:
            # Return proposal for user confirmation
            return {
                "text": _get_text_from_response(response),
                "pending_action": {
                    "tool": tool_block.name,
                    "params": tool_block.input,
                    "tool_use_id": tool_block.id,
                    "description": _describe_action(tool_block.name, tool_block.input)
                },
                "requires_confirmation": True,
                "history": messages + [{"role": "assistant", "content": _serialize_content(response.content)}]
            }

        # Execute read-only tool immediately
        try:
            result = execute_tool(dbo, session, tool_block.name, tool_block.input)
        except Exception as e:
            result = {"error": str(e)}

        # Send result back to Claude for the next response
        messages.append({"role": "assistant", "content": _serialize_content(response.content)})
        messages.append({"role": "user", "content": [{
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": json.dumps(result)
        }]})

        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=AI_MAX_TOKENS,
            system=system_prompt,
            tools=tools,
            messages=messages
        )

    # Final text response
    final_text = _get_text_from_response(response)
    final_history = messages + [{"role": "assistant", "content": _serialize_content(response.content)}]

    return {
        "text": final_text,
        "requires_confirmation": False,
        "history": final_history
    }


def _serialize_content(content):
    """Serialize Claude API content blocks for storage in history."""
    serialized = []
    for block in content:
        if block.type == "text":
            serialized.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            serialized.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input
            })
    return serialized


def _describe_action(tool_name, params):
    """Generate a human-readable description of a proposed action."""
    descriptions = {
        "add_animal": "Register new animal: %s" % params.get("name", ""),
        "update_weight": "Update weight to %sg for animal ID %s" % (params.get("weight", ""), params.get("animal_id", "")),
        "move_animal": "Move animal ID %s to location ID %s" % (params.get("animal_id", ""), params.get("location_id", "")),
        "add_vaccination": "Record vaccination (type %s) for animal ID %s" % (params.get("vaccination_type_id", ""), params.get("animal_id", "")),
        "add_test": "Record test (type %s) for animal ID %s" % (params.get("test_type_id", ""), params.get("animal_id", "")),
        "add_medical_treatment": "Add treatment '%s' for animal ID %s" % (params.get("treatment_name", ""), params.get("animal_id", "")),
        "add_diary": "Create diary entry: %s" % params.get("subject", ""),
    }
    return descriptions.get(tool_name, "Execute %s" % tool_name)
