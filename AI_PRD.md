# AI Assistant - Product Requirements Document

> ASM3 Animal Shelter Manager - AI-Powered Natural Language Interface

## 1. Product Overview

### Problem Statement
Shelter staff frequently need to update animal records while physically examining animals - recording weights, adding medical notes, logging vaccinations, and moving animals between locations. Currently this requires stopping the examination, washing hands, navigating to the correct page, and manually entering data. This interrupts workflow and leads to forgotten or delayed data entry.

### Solution
An AI assistant embedded directly into ASM3 that accepts voice and text commands in natural language. Staff can speak commands like "add a weight of 450 grams for Hedgehog Bob" or "move Spike to shelter 3" while continuing their examination. The AI interprets the command, maps it to the correct ASM3 operation, and executes it with appropriate confirmation.

### Primary Use Cases

| Use Case | Example Command | ASM3 Operation |
|----------|----------------|----------------|
| Move animal to location | "Move Bob to shelter 3" | `movement.insert_movement_from_form()` |
| Register new animal | "Register a new hedgehog called Spike" | `animal.insert_animal_from_form()` |
| Add medical note | "Add a note: Bob has a dry patch on left flank" | `log.add_log()` |
| Record weight | "Bob weighs 450 grams" | `animal.update_variable_animal_data()` |
| Add vaccination | "Record distemper vaccine for Bob" | `medical.insert_vaccination_from_form()` |
| Record test result | "Bob's fecal test came back negative" | `medical.insert_test_from_form()` |
| Search for animal | "Find the hedgehog that came in last Tuesday" | `animal.get_animal_find_simple()` |
| Add diary note | "Schedule a checkup for Bob next week" | `diary.insert_diary()` |
| Look up information | "What vaccinations has Bob had?" | `medical.get_vaccinations()` |
| Add medical treatment | "Start Bob on Ivermectin 0.2ml daily" | `medical.insert_regimen_from_form()` |

### Target Users
- Shelter staff performing animal examinations and intake
- Veterinary staff recording treatments and observations
- Volunteer coordinators managing animal movements
- Any ASM3 user who wants faster data entry

---

## 2. Architecture

### Decision: Claude API with Tool Use

**Chosen approach**: Server-side Claude API integration using Anthropic's Tool Use feature.

**Why Tool Use (not alternatives)**:

| Approach | Verdict | Reason |
|----------|---------|--------|
| **Claude API + Tool Use** | **Selected** | Structured parameter extraction maps directly to ASM3 functions. Claude selects the right tool and extracts parameters reliably. |
| MCP Server | Rejected | Designed for developer tools and IDE integrations, not end-user web applications. Adds unnecessary infrastructure complexity. |
| Prompt-only (parse JSON) | Rejected | Fragile - LLM JSON output can be malformed. No structured schema validation. Tool Use solves this natively. |
| Browser-side AI calls | Rejected | Exposes API key to client. No server-side permission enforcement. |

### System Architecture

```
+-------------------+     +---------------------+     +------------------+
|                   |     |                     |     |                  |
|  Browser          |     |  ASM3 Backend       |     |  Claude API      |
|                   |     |  (Python/web.py)    |     |  (Anthropic)     |
|  +--------------+ |     |                     |     |                  |
|  | Chat Panel   | |     |  +---------------+  |     |                  |
|  | (jQuery UI)  |------>|  | ai_assistant   |------->|  Messages API   |
|  |              | | POST|  | endpoint       |  | API|  with Tool Use  |
|  | Web Speech   | |     |  +---------------+  |     |                  |
|  | API (voice)  | |     |         |            |     +------------------+
|  +--------------+ |     |         v            |
|                   |     |  +---------------+   |     +------------------+
|  +--------------+ |     |  | ai_assistant  |   |     |                  |
|  | Page Context | |     |  | .py module    |   |     |  PostgreSQL      |
|  | (animal ID,  | |     |  | - tools       |   |     |  Database        |
|  |  page type)  | |     |  | - execution   |-------->|                  |
|  +--------------+ |     |  | - permissions |   |     |                  |
|                   |     |  +---------------+   |     +------------------+
+-------------------+     +---------------------+
```

### Request Flow

```
1. User speaks or types: "Move Bob to shelter 3"
         |
2. Browser sends POST /ai_assistant
   { mode: "chat", message: "Move Bob to shelter 3",
     context: { page: "animal", id: 42 }, history: [...] }
         |
3. Backend builds Claude request:
   - System prompt with shelter context (locations, species, etc.)
   - Page context ("User is currently viewing animal #42: Bob")
   - Filtered tool definitions (only tools user has permission for)
   - Conversation history
         |
4. Claude API returns tool_use:
   { tool: "move_animal", input: { animal_id: 42, location_id: 3 } }
         |
5. Backend classifies action:
   - READ actions -> execute immediately, return result
   - WRITE actions -> return proposal for confirmation
   - DESTRUCTIVE actions -> always return proposal for confirmation
         |
6. Browser shows result or confirmation prompt
         |
7. If confirmation needed: user confirms -> POST mode=confirm
   Backend executes, returns result
```

---

## 3. User Experience

### UI: Floating Chat Bubble

The AI assistant appears as a floating button in the bottom-right corner of every page, expanding into a chat panel when clicked.

```
+------------------------------------------+
|  ASM3 - Animal: Bob (HH042)        [AI] |  <-- topline AI button
|------------------------------------------|
|                                          |
|  (normal page content visible beneath)   |
|                                          |
|                 +------------------------+
|                 | AI Assistant      [-][x]|
|                 |------------------------|
|                 |                        |
|                 | You: Move bob to       |
|                 |   shelter 3            |
|                 |                        |
|                 | AI: I'll move          |
|                 |   Hedgehog Bob (HH042) |
|                 |   to Shelter 3.        |
|                 |                        |
|                 |   [Confirm]  [Cancel]  |
|                 |                        |
|                 |------------------------|
|                 | [mic]  Type here  [>]  |
|                 +------------------------+
+------------------------------------------+
```

### UI Elements

| Element | Behavior |
|---------|----------|
| **Topline AI button** | Always visible in header bar. Click toggles panel. Keyboard shortcut: `Alt+Shift+Q`. |
| **Chat panel** | jQuery UI dialog, fixed bottom-right, resizable, draggable. Persists across page navigation within session. |
| **Message area** | Scrollable history. User messages right-aligned, AI responses left-aligned. Action results shown inline with links to created/modified records. |
| **Text input** | Standard text field with send button. Enter to send. |
| **Mic button** | Push-to-talk. Glows red when recording. Shows interim transcription. Sends on release/silence. |
| **Speaker toggle** | Enables/disables text-to-speech for AI responses. Icon shows current state. |
| **Minimize [-]** | Collapses panel to just the floating button. |
| **Close [x]** | Closes panel and clears conversation. |

### Voice Implementation

**Speech-to-Text**: Browser Web Speech API (`SpeechRecognition`)
- Push-to-talk activation (mic button or keyboard shortcut)
- Shows interim results as user speaks
- Sends final transcript when speech ends
- No additional API costs - runs entirely in browser
- Works in Chrome, Edge, Safari (Firefox has limited support)

**Text-to-Speech**: Browser Web Speech API (`SpeechSynthesis`)
- Reads AI responses aloud when speaker toggle is enabled
- Uses system voice matching the ASM3 locale
- Can be interrupted by new input
- No additional API costs

**Fallback**: When Web Speech API is unavailable (older browsers, HTTP-only), voice buttons are hidden and text-only mode is used.

### Confirmation Behavior

Actions are classified into three tiers:

| Tier | Action Types | Behavior |
|------|-------------|----------|
| **Immediate** | Search, get details, list locations, lookup info | Executes immediately, shows results |
| **Confirm** | Add record, update field, add vaccination, record weight | AI proposes action with details, user clicks Confirm or says "yes" |
| **Always Confirm** | Delete record, change ownership, return from adoption | AI proposes with warning, requires explicit confirmation |

### Page-Aware Context

The chat panel automatically detects the current page context and passes it to the AI:

| Current Page | Context Provided | Example Benefit |
|-------------|-----------------|-----------------|
| `animal?id=42` | Animal ID, name, species, current location | "Add a vaccination" - AI knows which animal |
| `person?id=15` | Person ID, name, address | "Log a call" - AI knows which person |
| `shelterview` | Current shelter view, visible locations | "How many animals in shelter 3?" |
| `animal_find_results` | Search results context | "Tell me more about the first one" |
| Any other page | No specific context | User must specify animal/person by name |

Context is extracted from the JavaScript `controller` object and the current URL, sent with each chat request.

---

## 4. Technical Specification

### 4.1 Backend Module: `src/asm3/ai_assistant.py`

Core module handling all AI logic. Key components:

#### Tool Definitions

Each tool maps to an existing ASM3 Python function:

```python
TOOLS = [
    {
        "name": "search_animal",
        "description": "Search for animals by name, code, microchip number, or other criteria. Returns a list of matching animals with basic details.",
        "permission": "va",  # VIEW_ANIMAL
        "confirm": False,    # Read-only, no confirmation needed
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term: animal name, shelter code, or microchip number"}
            },
            "required": ["query"]
        },
        "handler": "handle_search_animal"
    },
    {
        "name": "get_animal_details",
        "description": "Get full details of a specific animal including medical history, location, and status.",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"}
            },
            "required": ["animal_id"]
        },
        "handler": "handle_get_animal_details"
    },
    {
        "name": "add_animal",
        "description": "Register a new animal in the shelter. Requires at least a name and animal type/species.",
        "permission": "aa",  # ADD_ANIMAL
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Animal's name"},
                "species_id": {"type": "integer", "description": "Species ID (use get_species to look up)"},
                "breed_id": {"type": "integer", "description": "Breed ID (use get_breeds to look up)"},
                "sex": {"type": "integer", "description": "0=Female, 1=Male, 2=Unknown"},
                "date_of_birth": {"type": "string", "description": "Date of birth YYYY-MM-DD (estimated is ok)"},
                "colour_id": {"type": "integer", "description": "Colour ID"},
                "animal_type_id": {"type": "integer", "description": "Animal type ID"},
                "description": {"type": "string", "description": "Physical description or markings"},
                "internal_location_id": {"type": "integer", "description": "Shelter location ID"}
            },
            "required": ["name", "species_id", "animal_type_id"]
        },
        "handler": "handle_add_animal"
    },
    {
        "name": "update_animal",
        "description": "Update an existing animal's details such as name, description, or microchip number.",
        "permission": "ca",  # CHANGE_ANIMAL
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "field": {"type": "string", "description": "Field to update", "enum": ["name", "description", "microchip", "markings", "hidden_comments", "health_problems", "special_diet"]},
                "value": {"type": "string", "description": "New value for the field"}
            },
            "required": ["animal_id", "field", "value"]
        },
        "handler": "handle_update_animal"
    },
    {
        "name": "update_weight",
        "description": "Record a new weight measurement for an animal.",
        "permission": "ca",  # CHANGE_ANIMAL
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "weight": {"type": "number", "description": "Weight value"},
                "unit": {"type": "string", "description": "Weight unit", "enum": ["kg", "g", "lb", "oz"], "default": "g"}
            },
            "required": ["animal_id", "weight"]
        },
        "handler": "handle_update_weight"
    },
    {
        "name": "move_animal",
        "description": "Move an animal to a different location within the shelter.",
        "permission": "ca",  # CHANGE_ANIMAL (internal location change)
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "location_id": {"type": "integer", "description": "Target internal location ID (use get_locations to look up)"}
            },
            "required": ["animal_id", "location_id"]
        },
        "handler": "handle_move_animal"
    },
    {
        "name": "add_vaccination",
        "description": "Record a vaccination given to an animal.",
        "permission": "aav",  # ADD_VACCINATION
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "vaccination_type_id": {"type": "integer", "description": "Vaccination type ID (use get_vaccination_types to look up)"},
                "date_given": {"type": "string", "description": "Date given YYYY-MM-DD, defaults to today"},
                "comments": {"type": "string", "description": "Additional notes about the vaccination"}
            },
            "required": ["animal_id", "vaccination_type_id"]
        },
        "handler": "handle_add_vaccination"
    },
    {
        "name": "add_test",
        "description": "Record a medical test and its result for an animal.",
        "permission": "aat",  # ADD_TEST
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "test_type_id": {"type": "integer", "description": "Test type ID (use get_test_types to look up)"},
                "date_of_test": {"type": "string", "description": "Date of test YYYY-MM-DD, defaults to today"},
                "result_id": {"type": "integer", "description": "Test result ID (use get_test_results to look up)"},
                "comments": {"type": "string", "description": "Additional notes about the test"}
            },
            "required": ["animal_id", "test_type_id"]
        },
        "handler": "handle_add_test"
    },
    {
        "name": "add_medical_treatment",
        "description": "Add a medical treatment regimen for an animal (e.g., medication course).",
        "permission": "maam",  # ADD_MEDICAL
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "treatment_name": {"type": "string", "description": "Name of the treatment or medication"},
                "dosage": {"type": "string", "description": "Dosage information"},
                "start_date": {"type": "string", "description": "Start date YYYY-MM-DD, defaults to today"},
                "comments": {"type": "string", "description": "Additional notes"},
                "frequency": {"type": "string", "description": "Treatment frequency", "enum": ["once", "daily", "weekly", "monthly"]}
            },
            "required": ["animal_id", "treatment_name"]
        },
        "handler": "handle_add_medical_treatment"
    },
    {
        "name": "add_log",
        "description": "Add a log entry (observation note) to an animal's record.",
        "permission": "ale",  # ADD_LOG
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "The animal's database ID"},
                "log_type_id": {"type": "integer", "description": "Log type ID (defaults to general observation)"},
                "comments": {"type": "string", "description": "The log entry text"}
            },
            "required": ["animal_id", "comments"]
        },
        "handler": "handle_add_log"
    },
    {
        "name": "add_diary",
        "description": "Add a diary/task entry, optionally scheduled for a future date.",
        "permission": "adn",  # ADD_DIARY
        "confirm": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "animal_id": {"type": "integer", "description": "Animal ID to link to (optional)"},
                "diary_date": {"type": "string", "description": "Date for the diary entry YYYY-MM-DD"},
                "diary_time": {"type": "string", "description": "Time for the diary entry HH:MM (optional)"},
                "subject": {"type": "string", "description": "Subject/title of the entry"},
                "note": {"type": "string", "description": "Diary note content"}
            },
            "required": ["subject", "note"]
        },
        "handler": "handle_add_diary"
    },
    {
        "name": "search_person",
        "description": "Search for a person (owner, adopter, volunteer, etc.) by name or other details.",
        "permission": "vo",  # VIEW_PERSON
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term: person name, address, phone, or email"}
            },
            "required": ["query"]
        },
        "handler": "handle_search_person"
    },
    {
        "name": "get_locations",
        "description": "List all internal shelter locations (buildings, rooms, enclosures).",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {}
        },
        "handler": "handle_get_locations"
    },
    {
        "name": "get_species",
        "description": "List all species and their IDs.",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {}
        },
        "handler": "handle_get_species"
    },
    {
        "name": "get_breeds",
        "description": "List breeds for a given species.",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "species_id": {"type": "integer", "description": "Species ID to get breeds for"}
            },
            "required": ["species_id"]
        },
        "handler": "handle_get_breeds"
    },
    {
        "name": "get_vaccination_types",
        "description": "List available vaccination types.",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {}
        },
        "handler": "handle_get_vaccination_types"
    },
    {
        "name": "get_test_types",
        "description": "List available medical test types and result options.",
        "permission": "va",
        "confirm": False,
        "input_schema": {
            "type": "object",
            "properties": {}
        },
        "handler": "handle_get_test_types"
    }
]
```

#### System Prompt Construction

The system prompt is built dynamically per request and includes:

```
You are an AI assistant for {shelter_name}, an animal shelter management system.
Today's date is {current_date}. The user's name is {username}.

You help shelter staff manage animal records using voice and text commands.
Be concise in responses - staff are often hands-free during examinations.

Available shelter locations:
{list of location names and IDs}

Available species:
{list of species names and IDs}

Common breeds:
{list of common breed names and IDs by species}

When the user refers to an animal by name, use search_animal to find the correct
record before taking action. If multiple matches are found, ask the user to clarify.

{if page context exists}
The user is currently viewing: {animal/person name and details}
When they refer to "this animal" or don't specify which animal, assume they mean
the one they're currently viewing.
{end if}

For write operations, provide a clear summary of what you're about to do.
If any required information is missing, ask the user rather than guessing.
```

#### Permission Filtering

Before each Claude API call, tools are filtered based on the user's permission map:

```python
def get_available_tools(session):
    """Return only tools the current user has permission to use."""
    available = []
    for tool in TOOLS:
        if tool["permission"] == "" or asm3.users.check_permission_bool(
            session, tool["permission"]
        ):
            available.append(format_tool_for_claude(tool))
    return available
```

#### Tool Execution

```python
def execute_tool(dbo, session, tool_name, tool_input):
    """Execute a tool call, respecting permissions and returning structured results."""
    tool = get_tool_by_name(tool_name)

    # Verify permission (defense in depth)
    asm3.users.check_permission(session, tool["permission"])

    # Call the handler function
    handler = getattr(sys.modules[__name__], tool["handler"])
    result = handler(dbo, session, tool_input)

    # Audit log
    asm3.al.info(dbo, "ai_assistant", session.user,
        "AI tool executed: %s with params: %s" % (tool_name, str(tool_input)))

    return result
```

#### Chat Function (Main Entry Point)

```python
def chat(dbo, session, message, history, context):
    """
    Process a chat message through Claude API with tool use.

    Args:
        dbo: Database object
        session: User session (for permissions)
        message: User's text message
        history: List of previous messages in conversation
        context: Dict with page context {page, id, data}

    Returns:
        Dict with response text, any pending actions, and updated history
    """
    client = anthropic.Anthropic(api_key=AI_API_KEY)

    tools = get_available_tools(session)
    system_prompt = build_system_prompt(dbo, session, context)

    messages = history + [{"role": "user", "content": message}]

    response = client.messages.create(
        model=AI_MODEL,
        max_tokens=AI_MAX_TOKENS,
        system=system_prompt,
        tools=tools,
        messages=messages
    )

    # Handle tool use loop
    while response.stop_reason == "tool_use":
        tool_block = next(b for b in response.content if b.type == "tool_use")
        tool_def = get_tool_by_name(tool_block.name)

        if tool_def["confirm"]:
            # Return proposal for user confirmation
            return {
                "text": get_text_from_response(response),
                "pending_action": {
                    "tool": tool_block.name,
                    "params": tool_block.input,
                    "tool_use_id": tool_block.id
                },
                "requires_confirmation": True,
                "history": messages + [{"role": "assistant", "content": response.content}]
            }

        # Execute read-only tool immediately
        result = execute_tool(dbo, session, tool_block.name, tool_block.input)

        # Send result back to Claude for next response
        messages.append({"role": "assistant", "content": response.content})
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
    return {
        "text": get_text_from_response(response),
        "requires_confirmation": False,
        "history": messages + [{"role": "assistant", "content": response.content}]
    }
```

### 4.2 Endpoint: `src/main.py`

New endpoint class added to main.py:

```python
class ai_assistant(JSONEndpoint):
    url = "ai_assistant"
    get_permissions = asm3.users.VIEW_ANIMAL

    def controller(self, o):
        return {
            "ai_enabled": asm3.sitedefs.AI_ENABLED and asm3.sitedefs.AI_API_KEY != "",
            "locations": asm3.lookups.get_internal_locations(o.dbo, o.lf),
            "species": asm3.lookups.get_species(o.dbo),
        }

    def post_chat(self, o):
        """Handle a chat message"""
        self.content_type("application/json")
        message = o.post["message"]
        history = asm3.utils.json_parse(o.post["history"]) if o.post["history"] else []
        context = asm3.utils.json_parse(o.post["context"]) if o.post["context"] else {}
        return asm3.utils.json({
            "response": asm3.ai_assistant.chat(o.dbo, o.session, message, history, context)
        })

    def post_confirm(self, o):
        """Execute a previously proposed action"""
        self.content_type("application/json")
        tool_name = o.post["tool"]
        params = asm3.utils.json_parse(o.post["params"])
        result = asm3.ai_assistant.execute_tool(o.dbo, o.session, tool_name, params)
        return asm3.utils.json({"result": result, "success": True})
```

### 4.3 Frontend: `src/static/js/ai_assistant.js`

The frontend module provides the floating chat panel with voice support.

#### Core Structure

```javascript
$(function() {
    const ai_assistant = {
        conversation_id: null,
        messages: [],
        voice_output_enabled: false,
        panel_visible: false,

        // Standard ASM3 module methods
        render: function() { /* returns chat panel HTML */ },
        bind: function() { /* attaches event handlers */ },
        sync: function() {},
        title: function() { return _("AI Assistant"); },

        // Chat methods
        send_message: function(text) { /* POST to ai_assistant */ },
        display_response: function(response) { /* render in chat area */ },
        confirm_action: function(action) { /* POST to confirm */ },

        // Voice methods
        voice: {
            recognition: null,
            synthesis: window.speechSynthesis,
            init: function() { /* initialize Web Speech API */ },
            start_listening: function() { /* begin recording */ },
            stop_listening: function() { /* stop and send transcript */ },
            speak: function(text) { /* text-to-speech response */ }
        },

        // Context methods
        get_page_context: function() { /* extract current page info */ },

        // Panel methods
        toggle_panel: function() { /* show/hide chat panel */ },
        new_conversation: function() { /* reset conversation */ }
    };

    common.module_register(ai_assistant);
});
```

#### Chat Panel HTML

```html
<div id="ai-chat-panel" style="display:none; position:fixed; bottom:20px; right:20px;
     width:380px; z-index:10000;">
  <div class="ui-widget ui-widget-content ui-corner-all" style="box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    <!-- Header -->
    <div class="ui-widget-header ui-corner-top" style="padding:8px 12px; cursor:move;">
      <span style="font-weight:bold;">AI Assistant</span>
      <span id="ai-minimize" style="float:right; cursor:pointer;" title="Minimize">-</span>
      <span id="ai-close" style="float:right; cursor:pointer; margin-right:8px;" title="Close">x</span>
      <span id="ai-voice-toggle" style="float:right; cursor:pointer; margin-right:8px;"
            title="Toggle voice output" class="asm-icon asm-icon-audio"></span>
    </div>

    <!-- Messages -->
    <div id="ai-messages" style="height:350px; overflow-y:auto; padding:12px; background:#fafafa;">
    </div>

    <!-- Input -->
    <div style="padding:8px; border-top:1px solid #ddd; display:flex; gap:6px;">
      <button id="ai-mic" class="asm-icon asm-icon-microphone" title="Push to talk"
              style="width:36px; height:36px;"></button>
      <input id="ai-input" type="text" placeholder="Type a command..."
             style="flex:1; padding:6px;">
      <button id="ai-send" class="asm-icon asm-icon-forward" title="Send"
              style="width:36px; height:36px;"></button>
    </div>
  </div>
</div>
```

#### Page Context Extraction

```javascript
get_page_context: function() {
    var path = common.current_url().split("?")[0];
    var context = { page: path };

    // Animal page
    if (path === "animal" && controller && controller.animal) {
        context.id = controller.animal.ID;
        context.name = controller.animal.ANIMALNAME;
        context.species = controller.animal.SPECIESNAME;
        context.location = controller.animal.SHELTERLOCATIONNAME;
        context.code = controller.animal.SHELTERCODE;
        context.type = "animal";
    }
    // Person page
    else if (path === "person" && controller && controller.person) {
        context.id = controller.person.ID;
        context.name = controller.person.OWNERNAME;
        context.type = "person";
    }

    return context;
}
```

#### Voice Implementation

```javascript
voice: {
    recognition: null,
    synthesis: window.speechSynthesis,
    is_listening: false,

    init: function() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            $("#ai-mic").hide();  // Hide mic if not supported
            return;
        }
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = asm.locale ? asm.locale.replace("_", "-") : "en-GB";

        this.recognition.onresult = function(event) {
            var transcript = "";
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            $("#ai-input").val(transcript);
            if (event.results[event.results.length - 1].isFinal) {
                ai_assistant.send_message(transcript);
            }
        };

        this.recognition.onend = function() {
            ai_assistant.voice.is_listening = false;
            $("#ai-mic").removeClass("ai-recording");
        };
    },

    toggle_listening: function() {
        if (this.is_listening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
            this.is_listening = true;
            $("#ai-mic").addClass("ai-recording");
        }
    },

    speak: function(text) {
        if (!ai_assistant.voice_output_enabled) return;
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = asm.locale ? asm.locale.replace("_", "-") : "en-GB";
        this.synthesis.speak(utterance);
    }
}
```

### 4.4 Header Integration: `src/static/js/header.js`

Add AI button to the topline bar in the `render()` function:

```javascript
// In the topline div, before the user menu:
'<div class="topline-element">',
    '<div id="asm-topline-ai" class="asm-menu-icon" ',
    'title="' + _("AI Assistant") + ' (Alt+Shift+Q)" style="cursor:pointer">',
        '<span class="asm-icon asm-icon-callout"></span>',
    '</div>',
'</div>',
```

Add binding in `bind()` function:

```javascript
$("#asm-topline-ai").click(function() {
    ai_assistant.toggle_panel();
});
Mousetrap.bind("alt+shift+q", function() {
    ai_assistant.toggle_panel();
    return false;
});
```

### 4.5 Menu Item: `src/asm3/html.py`

Add to `menu_structure()` in the ASM menu section:

```python
("", "", "", "ai_assistant", "asm-icon-callout", _("AI Assistant", l)),
```

### 4.6 Configuration

**`src/asm3/sitedefs.py`** - Add configuration constants:
```python
AI_ENABLED = get_boolean("ai.enabled", False)
AI_API_KEY = get_string("ai.api_key", "")
AI_MODEL = get_string("ai.model", "claude-sonnet-4-20250514")
AI_MAX_TOKENS = get_integer("ai.max_tokens", 4096)
```

**`asm3.conf`** - Add section:
```ini
# AI Assistant
ai.enabled = ${ASM3_AI_ENABLED}
ai.api_key = ${ASM3_AI_API_KEY}
ai.model = ${ASM3_AI_MODEL}
```

**`.env.example`** - Add variables:
```bash
# AI Assistant Configuration
ASM3_AI_ENABLED=false
ASM3_AI_API_KEY=your-anthropic-api-key-here
ASM3_AI_MODEL=claude-sonnet-4-20250514
```

**`Dockerfile`** - Add to pip install:
```
anthropic>=0.40.0
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Config + Backend Module)

| Step | File | Change |
|------|------|--------|
| 1.1 | `src/asm3/sitedefs.py` | Add AI config constants |
| 1.2 | `asm3.conf` | Add AI section |
| 1.3 | `.env.example` | Add AI environment variables |
| 1.4 | `Dockerfile` | Add `anthropic` pip dependency |
| 1.5 | `src/asm3/ai_assistant.py` | Create core module with tool definitions, system prompt builder, permission filter, tool executor, and chat function |

### Phase 2: Endpoint

| Step | File | Change |
|------|------|--------|
| 2.1 | `src/main.py` | Add `ai_assistant` endpoint class with `post_chat` and `post_confirm` methods |

### Phase 3: Frontend

| Step | File | Change |
|------|------|--------|
| 3.1 | `src/static/js/ai_assistant.js` | Create chat panel module with message rendering, AJAX communication, confirmation flow |
| 3.2 | `src/static/js/ai_assistant.js` | Add Web Speech API voice input (push-to-talk) |
| 3.3 | `src/static/js/ai_assistant.js` | Add Web Speech API voice output (text-to-speech toggle) |
| 3.4 | `src/static/js/ai_assistant.js` | Add page context extraction |

### Phase 4: Integration

| Step | File | Change |
|------|------|--------|
| 4.1 | `src/static/js/header.js` | Add AI button to topline bar |
| 4.2 | `src/asm3/html.py` | Add menu item for AI Assistant |
| 4.3 | CSS (inline or `asm.css`) | Styles for chat panel, recording indicator, message bubbles |

### Phase 5: Testing & Polish

| Step | Action |
|------|--------|
| 5.1 | Manual testing of all 17 tools via text commands |
| 5.2 | Voice input testing with animal-specific vocabulary |
| 5.3 | Permission enforcement testing (restricted user) |
| 5.4 | Confirmation flow testing (confirm and cancel) |
| 5.5 | Page context testing (commands from animal page vs. other pages) |
| 5.6 | Error handling (API failures, invalid commands, network issues) |

---

## 6. Testing Strategy

### Unit Tests
- Tool definition validation (all tools have required fields)
- Permission filtering (user without ADD_ANIMAL doesn't see add_animal tool)
- PostedData construction from tool parameters
- System prompt includes correct shelter data
- Tool handler functions return expected formats

### Integration Tests
- End-to-end: send message -> Claude returns tool_use -> execute -> verify DB
- Confirmation flow: propose -> confirm -> execute -> verify
- Confirmation flow: propose -> cancel -> verify no change
- Multi-step conversation: search -> select -> act
- Permission denied: user without permission gets error

### Manual Testing Checklist
- [ ] AI button appears in topline on all pages
- [ ] Chat panel opens/closes correctly
- [ ] Text input sends message and displays response
- [ ] Voice input records and transcribes speech
- [ ] Voice output reads AI responses aloud
- [ ] Page context detected on animal pages
- [ ] Page context detected on person pages
- [ ] Confirmation dialog appears for write actions
- [ ] Read-only actions execute without confirmation
- [ ] Confirm button executes the proposed action
- [ ] Cancel button discards the proposed action
- [ ] Created records have correct data in database
- [ ] Links to created/modified records work
- [ ] Panel persists state when minimized and reopened
- [ ] Panel clears state on close
- [ ] Keyboard shortcut (Alt+Shift+Q) toggles panel
- [ ] AI disabled message shown when AI not configured
- [ ] Error messages displayed for API failures
- [ ] No JavaScript console errors
- [ ] Works on mobile viewport (responsive)

### Browser Compatibility
| Browser | Voice Input | Voice Output | Chat Panel |
|---------|-------------|--------------|------------|
| Chrome | Full support | Full support | Full support |
| Edge | Full support | Full support | Full support |
| Safari | Full support | Full support | Full support |
| Firefox | Limited (no continuous) | Full support | Full support |

---

## 7. Security Considerations

| Concern | Mitigation |
|---------|------------|
| API key exposure | Key stored server-side only in `asm3.conf` / environment. Never sent to browser. |
| Unauthorized actions | Tools filtered by user permissions. Permission re-verified at execution time. |
| Prompt injection | User input sent as user messages (not system prompt). Tool execution validates parameters. |
| Rate limiting | Implement per-user rate limiting using `asm3.cachemem` (e.g., 20 requests/minute). |
| Audit trail | All AI-executed actions logged via `asm3.al.info()` with conversation ID and tool details. |
| Data leakage | Claude API calls only include data the user already has permission to view. |
| Voice mishearing | Confirmation required for write actions prevents accidental modifications. |

---

## 8. Cost Considerations

| Component | Cost |
|-----------|------|
| Claude Sonnet API | ~$3/MTok input, ~$15/MTok output. Typical command: ~2K tokens = ~$0.01/command |
| Web Speech API | Free (browser-native) |
| Infrastructure | No additional services needed - runs within existing ASM3 container |

**Estimated monthly cost**: For a shelter with 5 staff making ~50 AI commands/day = ~7,500 commands/month = ~$75/month at Sonnet pricing.

---

## 9. Future Enhancements (Out of Scope for V1)

- **Streaming responses**: Use Claude streaming API for real-time text display
- **Image recognition**: Take a photo of an animal and have AI identify breed/species
- **Custom vocabulary**: Train speech recognition with shelter-specific terms
- **Conversation persistence**: Store conversations in database for history/training
- **Bulk operations**: "Vaccinate all hedgehogs in shelter 3"
- **Report generation**: "How many animals were adopted last month?"
- **WhatsApp/SMS integration**: Accept commands via messaging apps
- **Whisper API fallback**: For browsers without Web Speech API support

---

**Document Version**: 1.0
**Created**: 2026-03-07
**Last Updated**: 2026-03-07
**Status**: Draft - Pending Implementation
