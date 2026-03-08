# AI Assistant - Implementation Progress

> Handover document for continuing implementation across Claude sessions.
> Pair with `AI_PRD.md` for full requirements and architecture.

## Branch

`feature/ai-assistant` (based off `master`)

## Status: Phase 4 Complete, Phase 5 (Testing) Next

### Phase 1: Foundation + Config + Backend Module -- DONE

All 42 unit tests passing.

**Files created:**
- `src/asm3/ai_assistant.py` -- Core backend module (~520 lines)
- `unittest/test_ai_assistant.py` -- 42 tests across 9 test classes

**Files modified:**
- `src/asm3/sitedefs.py` -- Added AI config constants (lines 408-412):
  - `AI_ENABLED`, `AI_API_KEY`, `AI_MODEL`, `AI_MAX_TOKENS`
  - Config keys use underscores: `ai_enabled`, `ai_api_key`, `ai_model`
- `asm3.conf` -- Added AI section (lines 63-66)
- `.env.example` -- Added `ASM3_AI_ENABLED`, `ASM3_AI_API_KEY`, `ASM3_AI_MODEL` (lines 65-68)
- `Dockerfile` -- Added `anthropic` to pip install (line 78)

**What `ai_assistant.py` contains:**
- 16 tool definitions with permission mapping and confirmation tiers
  - Read tools (no confirmation): `search_animal`, `get_animal_details`, `search_person`, `get_locations`, `get_species`, `get_breeds`, `get_vaccination_types`, `get_test_types`
  - Write tools (confirmation required): `add_animal`, `update_weight`, `move_animal`, `add_vaccination`, `add_test`, `add_medical_treatment`, `add_diary`
  - Special: `add_log` is write but NO confirmation (quick observation notes)
- Handler functions for each tool calling real ASM3 functions
- `get_available_tools(session)` -- filters by user permissions
- `build_system_prompt(dbo, session, context)` -- page-aware context injection
- `execute_tool(dbo, session, tool_name, tool_input)` -- dispatcher with permission check + audit log
- `chat(dbo, session, message, history, context)` -- Claude API tool-use loop with confirmation flow
- `_serialize_content()`, `_describe_action()`, `_make_post()` -- helpers

**Key implementation decisions made:**
- `import anthropic` is lazy (inside `chat()` function, after API key check) so the module loads without anthropic installed
- Tool handlers convert params to `PostedData` via `_make_post()` -- all values stringified since PostedData expects strings
- Security map format: flags delimited by `*`, each flag has trailing space (e.g., `"va *aa *ca *"`)
- FakeSession in tests needs `__contains__` because ASM3 uses `"superuser" in session`
- Dates from Claude come as YYYY-MM-DD, converted to MM/DD/YYYY for PostedData (ASM3's internal format)
- `update_location_unit()` used for moving animals (not `insert_movement_from_form`) -- changes internal location without creating adoption/movement record
- Log link types differ between modules: `asm3.log.ANIMAL = 0`, `asm3.diary.ANIMAL = 1`

**Test database:**
- Run `make o_tests` to rebuild test DB (creates `scripts/unittestdb/base.db`)
- Before running AI tests: `cp scripts/unittestdb/base.db scripts/unittestdb/test.db`
- Or just `make o_tests` runs the full suite including our tests
- 44 pre-existing test failures from missing optional deps (reportlab, etc.) -- not ours

---

### Phase 2: Endpoint -- DONE

**Files modified:**
- `src/main.py` -- Added `ai_assistant` endpoint class (line ~2022) and import

**What was built:**
- `import asm3.ai_assistant` added to imports
- `AI_ENABLED`, `AI_API_KEY` imported from `asm3.sitedefs`
- `class ai_assistant(JSONEndpoint)` with:
  - `url = "ai_assistant"`, `get_permissions = asm3.users.VIEW_ANIMAL`
  - `controller(self, o)` -- returns `ai_enabled` (bool), `locations`, `species`
  - `post_chat(self, o)` -- parses message/history/context from POST, calls `asm3.ai_assistant.chat()`, returns JSON
  - `post_confirm(self, o)` -- parses tool/params from POST, calls `asm3.ai_assistant.execute_tool()`, returns JSON
- Route `/ai_assistant` verified as registered via `generate_routes()`
- All 42 existing unit tests still pass

---

### Phase 3: Frontend -- DONE

**Files created:**
- `src/static/js/ai_assistant.js` -- Floating chat panel (~310 lines)

**What was built:**
- Self-initializing global `ai_assistant` object (not a page module -- it's a floating overlay on every page)
- Auto-injects floating panel HTML into `<body>` on page load
- Skips init on login/database pages
- Auto-included in rollup bundle (rollup.py picks up all .js files)

**Features implemented:**
- Chat panel: fixed bottom-right, draggable header, z-index 10000
- Message display: user (blue, right-aligned), AI (grey, left-aligned), errors (red)
- Typing indicator while waiting for response
- AJAX via `common.ajax_post("ai_assistant", formdata)` with mode=chat and mode=confirm
- Confirmation flow: Confirm/Cancel buttons for write actions
- Page context extraction from `controller` object (animal page, person page)
- Web Speech API: push-to-talk mic button (red highlight when recording)
- Web Speech API: text-to-speech toggle for AI responses
- New conversation button, minimize, close
- Keyboard shortcut: Alt+Shift+Q (via Mousetrap)
- Conversation history maintained in `conversation_history` array
- XSS protection: text escaped via jQuery `.text().html()` pattern
- Graceful degradation: mic button hidden when SpeechRecognition unavailable

---

### Phase 4: Integration -- DONE

**Files modified:**
- `src/static/js/header.js` -- Added AI button to topline bar (render + click binding)
- `src/asm3/html.py` -- Added AI category and menu item in `menu_structure()`

**What was built:**
- Topline button: `#asm-topline-ai` with callout icon, placed before user/help buttons
- Click binding: calls `ai_assistant.toggle_panel()` with `typeof` guard
- Menu item: "AI" category with "AI Assistant" entry under ASM menu, shortcut Alt+Shift+Q
- Permission: `VIEW_ANIMAL` (same as endpoint minimum)
- Keyboard shortcut already handled by `ai_assistant.js` via Mousetrap

---

## Key Reference Files

| File | What it's for |
|------|--------------|
| `src/asm3/users.py:22-199` | Permission flag constants |
| `src/asm3/users.py:248-255` | `check_permission_bool()` |
| `src/asm3/utils.py:56-76` | `PostedData` class |
| `src/main.py:727+` | `JSONEndpoint` base class |
| `src/main.py:460` | `generate_routes()` |
| `src/asm3/animal.py:3176` | `insert_animal_from_form()` |
| `src/asm3/animal.py:3955` | `update_location_unit()` |
| `src/asm3/animal.py:1148` | `get_animal_find_simple()` |
| `src/asm3/log.py:19` | `add_log()` |
| `src/asm3/diary.py:385` | `insert_diary()` |
| `src/asm3/medical.py:1162` | `insert_vaccination_from_form()` |
| `src/asm3/medical.py:1229` | `insert_test_from_form()` |
| `src/asm3/medical.py:1040` | `insert_regimen_from_form()` |
| `src/asm3/html.py` | `menu_structure()` for menu items |
| `src/static/js/header.js` | Topline bar UI |

## Git History

- `df9c7a2` -- Phase 1: `feat: add AI assistant backend module with tool definitions and tests (Phase 1)`
- Phase 2-4: uncommitted -- endpoint, frontend JS, header/menu integration
