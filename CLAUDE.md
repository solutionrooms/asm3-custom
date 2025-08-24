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

---

**Last Updated**: 2025-08-24
**ASM3 Upstream Version**: 50  
**Custom Version**: C1