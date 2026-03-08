# Claude.md - ASM3 Custom Fork

## Quick Context

Customized fork of [ASM3](https://github.com/sheltermanager/asm3) (Animal Shelter Manager) with Docker containerization.
**Stack**: Python 3 + web.py + PostgreSQL | **Frontend**: jQuery + jQuery UI
**Database schema**: `schema_list.txt`

## Test Credentials
- **Username**: `claude` | **Password**: `Kj32!8`

## Key Commands

```bash
# Development cycle
make o_rollup           # MUST rebuild after ANY JS changes
docker-compose restart asm3  # Apply Python/config changes
docker-compose down && docker-compose up -d  # Required for env var changes

# Testing
make o_tests            # Full unit test suite (44 pre-existing failures from missing optional deps)

# Other
make o_all              # Full build: clean, compile, tags, rollup, schema
make o_compile          # Lint JS + Python
make logs               # Show container logs
make shell              # Shell into ASM3 container
make db-shell           # PostgreSQL shell
```

## Critical Gotchas

1. **JS changes require `make o_rollup`** - The container loads `rollup_compat.min.js` (bundled). Editing JS files without rebuilding the bundle has NO effect.
2. **New env vars need THREE places**: `.env`, `docker-compose.yml` environment section, AND `asm3.conf.template` (envsubst substitutes template vars inside the container)
3. **`asm-menu-icon` CSS class** triggers the `asmmenu()` jQuery widget which hijacks click events. Don't use it on standalone buttons.
4. **Module method naming** - If a JS file both auto-initializes AND registers as a module (`common.module_register`), internal methods must not collide with module lifecycle names (`render`, `bind`, `sync`, `destroy`). The module registration overwrites them.
5. **Env var changes** require full `docker-compose down && up -d` (restart is insufficient)
6. **External URLs** in menu items cause JavaScript errors. Use internal redirects.

## ASM3 Architecture Patterns

### Backend Endpoint Pattern (`src/main.py`)
```python
class my_endpoint(JSONEndpoint):
    url = "my_endpoint"
    get_permissions = asm3.users.SOME_PERMISSION
    def controller(self, o):     # GET - returns data for JS module
        return {"key": "value"}
    def post_mode(self, o):      # POST with mode=mode (lowercase, 2-30 chars)
        return result
```

### Frontend Module Pattern (`src/static/js/*.js`)
```javascript
const my_module = {
    render: function() { return "html"; },  // Returns HTML for page body
    bind: function() { /* event handlers */ },
    sync: function() { /* init data */ },
    destroy: function() { return false; },
    name: "my_module",
    title: function() { return _("Title"); },
    routes: { "my_module": function() { common.module_loadandstart("my_module", "my_module"); } }
};
common.module_register(my_module);
```
- All `.js` files in `src/static/js/` are auto-included in rollup bundle
- AJAX: `common.ajax_post("endpoint", "mode=x&key=val", successFn, errorFn)`
- Permissions: `common.has_permission("flag")` (superuser bypasses all)

### Permission System
- **Backend**: `src/asm3/users.py` - flag constants (e.g., `USE_AI_ASSISTANT = "uaia"`)
- **Backend check**: `asm3.users.check_permission(session, flag)` / `check_permission_bool()`
- **Frontend check**: `common.has_permission("flag")` - returns true for superusers
- **Roles UI**: `src/static/js/roles.js` - `render_dialog()` builds the checkbox grid
- **Security map format**: flags delimited by `*` with trailing space (e.g., `"va *aa *ca *"`)

### Menu System (`src/asm3/html.py`)
```python
# In menu_structure(): (permission, shortcut, tag, url, icon, label)
(asm3.users.VIEW_ANIMAL, "alt+shift+v", "", "shelterview", "asm-icon-location", _("Shelter view", l))
```

### Header Topline (`src/static/js/header.js`)
- Buttons in `render()` around line 432
- Event binding in `bind()` around line 606
- Don't use `asm-menu-icon` class for non-dropdown buttons

### Config Flow
`.env` -> `docker-compose.yml` (environment) -> container env -> `envsubst` -> `asm3.conf.template` -> `asm3.conf` -> `src/asm3/sitedefs.py`

## AI Assistant Project

**PRD**: `AI_PRD.md` | **Progress**: `AI_PROGRESS.md` | **Branch**: `feature/ai-assistant`

### Files
- `src/asm3/ai_assistant.py` - Backend: 16 tool definitions, Claude API chat loop, permission filtering
- `src/static/js/ai_assistant.js` - Frontend: floating chat panel, voice, page context
- `src/main.py` - Endpoint class `ai_assistant(JSONEndpoint)`
- `unittest/test_ai_assistant.py` - 42 tests

### Key Decisions
- `import anthropic` is lazy (inside `chat()`) so module loads without the package
- Tool handlers convert params to `PostedData` via `_make_post()` (values stringified)
- `add_log` is write but NO confirmation (quick observation notes)
- Permission flag: `USE_AI_ASSISTANT` (`uaia`) - superusers always have access
- The JS file both auto-initializes a floating panel (on every page) AND registers as a module (for `/ai_assistant` URL)
- Internal methods use `bind_panel()` / `render_panel()` to avoid collision with module lifecycle

### Config
Requires in `.env`: `ASM3_AI_ENABLED=true`, `ASM3_AI_API_KEY=...`, `ASM3_AI_MODEL=...`
Passed via: `docker-compose.yml` env section + `asm3.conf.template`

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/main.py` | All endpoint classes, routing |
| `src/asm3/html.py` | Menu structure, page HTML generation |
| `src/asm3/users.py` | Permission flags and checking |
| `src/asm3/sitedefs.py` | Config constants from asm3.conf |
| `src/asm3/utils.py` | PostedData, json_parse, helpers |
| `src/static/js/header.js` | Topline bar, menus, notifications |
| `src/static/js/common.js` | Module system, AJAX, permissions |
| `src/static/js/roles.js` | User roles permission UI |
| `src/static/css/asm-icon.css` | Available icon classes |
| `asm3.conf.template` | Config template (envsubst) |
| `docker-compose.yml` | Container orchestration |
| `scripts/rollup/rollup.py` | JS bundling script |

---
**ASM3 Upstream Version**: 50 | **Custom Version**: C1
