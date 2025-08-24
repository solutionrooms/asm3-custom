# Claude.md - ASM3 Modification Project

> Reference document for AI assistance on this ASM3 fork project

## Quick Context

This is a customized fork of [Animal Shelter Manager 3 (ASM3)](https://github.com/sheltermanager/asm3) with Docker containerization and custom modifications.

**Original Project**: https://github.com/sheltermanager/asm3  
**Technology**: Python 3.x + web.py framework + PostgreSQL  
**My Focus**: Docker deployment + custom features + upstream sync management

## Project Goals

- [x] Fork and set up git tracking with upstream
- [ ] Complete Docker containerization
- [ ] Implement custom features
- [ ] Maintain sync capability with upstream
- [ ] Document all modifications comprehensively

## Current Architecture

```
├── src/                 # ASM3 source (upstream synced)
├── docker-compose.yml   # Docker orchestration
├── Dockerfile          # Application container build
├── asm3.conf           # ASM3 configuration file
├── .env.example        # Environment variables template
├── nginx*.conf         # Nginx configuration files
├── postgres-optimization.conf # PostgreSQL tuning
├── custom/             # My custom modules (planned)
│   ├── reports/
│   └── api/
├── docs/               # Custom documentation
├── MODIFICATIONS.md    # Detailed change log
└── scripts/           # Original ASM3 deployment utilities
    └── docker/        # Reference Docker files from upstream
```

## Key Commands

```bash
# Sync with upstream
git fetch upstream && git checkout main && git merge upstream/main

# Work on modifications  
git checkout -b feature/new-feature
git commit -m "feat: description of change"

# Deploy locally
docker-compose up --build

# Run tests
docker-compose exec asm3 python -m pytest
```

## Modification Strategy

### Git Workflow
- `main-custom` branch stays synced with upstream
- `develop` branch for stable modifications
- Feature branches for specific changes
- Regular upstream syncing with rebase strategy

### Code Changes
- Follow ASM3's existing patterns and conventions
- Custom code goes in `custom/` directory when possible
- Modify core files minimally and document thoroughly
- Use configuration/environment variables for customization

### Docker Strategy
- Multi-stage build for production optimization
- Separate containers for app, database, and caching
- Environment-based configuration
- Health checks and proper logging
- Development vs production compose files

## Documentation Standards

### Commit Messages
```
feat: add new functionality
fix: bug fix
docs: documentation changes  
docker: containerization changes
sync: upstream synchronization
```

### Change Tracking
All modifications logged in `MODIFICATIONS.md` with:
- Description of change
- Files modified
- Reason for modification  
- Upstream compatibility notes
- Testing performed



## Quick References

### Make Commands

**Docker Management (Primary Commands):**
- `make help` - Show all available commands
- `make build` - Build Docker images
- `make start` - Start the application
- `make stop` - Stop the application
- `make restart` - Restart the application
- `make logs` - Show application logs
- `make backup` - Backup database
- `make restore FILE=backup.dump` - Restore database
- `make shell` - Open shell in ASM3 container
- `make db-shell` - Open database shell
- `make version` - Show current ASM3 version
- `make upgrade` - Interactive version upgrade

**Original ASM3 Commands (prefixed with o_):**
- `make o_all` - Complete build: clean, compile, tags, rollup, schema
- `make o_test` - Run development server on port 5000
- `make o_tests` - Run unit test suite
- `make o_compile` - Compile/lint JavaScript and Python
- `make o_rollup` - Bundle and minify JavaScript files
- `make o_clean` - Clean build artifacts

### ASM3 Key Files
- `src/main.py` - Main application entry point
- `src/asm3/` - Core ASM3 modules directory
- `src/asm3/db.py` - Database abstraction layer
- `src/asm3/reports.py` - Report generation system
- `src/asm3/service.py` - Business logic services

### Custom Integration Points
- Environment variables in `.env` (copy from `.env.example`)
- Custom modules in `custom/` (planned)
- Docker configuration in project root
- Documentation in `docs/`

### Testing Strategy
- Unit tests for custom code
- Integration tests with Docker
- Upstream compatibility testing
- Database migration testing

## ASM3 Customization Patterns

### Development Workflow (Optimal)
```bash
# 1. Edit files locally (instant)
vim src/asm3/html.py

# 2. Deploy changes (10-15 seconds)
docker-compose restart asm3

# 3. Test immediately - changes are live!
```

### Hot-Reload Investigation Results
- **✅ Volume Mounting**: Works perfectly with `./src:/app/src:ro`
- **⚠ Key Issue**: Dockerfile `COPY ./src` conflicts with volume mount
- **✅ Solution**: Generate required build files locally (e.g. `__version__.py`)
- **❌ Auto-Reload**: web.py autoreload doesn't work in Docker/WSGI context
- **🔧 Debug Mode**: Successfully enabled via `ASM3_DEBUG=true` → `web.config.debug = True`

### Menu System Architecture
**Location**: `src/asm3/html.py` - `menu_structure()` function

**Menu Structure Format**:
```python
(permission, "identifier", _("Menu Name", l), subitems)

# Submenu items format (6 parameters):
(permission, shortcut, tag, url, icon, label)
```

**Example Menu Addition**:
```python
("", "custom", _("Custom", l), (
    ("", "", "", "internal_page", "asm-icon-web", _("Test", l))
))
```

**⚠ External URL Limitation**: Direct external URLs (https://google.com) in menu items cause JavaScript errors. Use internal redirects instead.

### Page Title/Header Customization
**Location**: `src/static/js/[page_name].js`

**Pattern for animal_new.js**:
```javascript
// Page header (line ~20)
html.content_header(_("Add a new animal")),

// Browser title (line ~607) 
title: function() { return _("Add a new animal"); },
```

### Critical Files for UI Changes
- **Menu Structure**: `src/asm3/html.py` (Python backend)
- **Page Content**: `src/static/js/[page].js` (Frontend JavaScript)
- **Permissions**: `src/asm3/users.py` (User access control)
- **Localization**: `src/asm3/locales/locale_*.py` + `src/static/js/locales/locale_*.js`

### Docker Volume Mount Setup
```yaml
# docker-compose.yml
volumes:
  - ./src:/app/src:ro  # Source code (read-only)
```

**Required Build Files** (must exist locally):
```bash
# Generate version file for development
echo '#!/usr/bin/env python3
VERSION = "50 [Custom Build Development]"
BUILD = "dev"' > src/asm3/__version__.py
```

### Configuration Integration
**Development Settings** (`asm3.conf.template`):
```ini
# Development settings
autoreload = true
debug_mode = ${ASM3_DEBUG}
```

**Environment Variables** (`.env`):
```bash
ASM3_DEBUG=true  # Enables web.py debug mode
```

### Common Pitfalls
1. **Menu JavaScript Errors**: Undefined values or external URLs break menu rendering
2. **Container Caching**: Environment variable changes require `docker-compose down/up`
3. **File Permissions**: Volume mounts need proper file access
4. **Localization**: UI text changes may need updates in multiple locale files

### Testing Checklist
- [ ] Menu loads without JavaScript errors
- [ ] Page titles/headers display correctly  
- [ ] Links navigate to intended destinations
- [ ] No Python errors in container logs
- [ ] Changes persist after container restart

---

**Last Updated**: 2025-08-24  
**ASM3 Upstream Version**: 50  
**Custom Version**: C1