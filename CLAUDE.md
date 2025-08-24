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
- [ ] Implement custom reporting features  
- [ ] Add API endpoint enhancements
- [ ] Maintain sync capability with upstream
- [ ] Document all modifications comprehensively

## Current Architecture

```
├── src/                 # ASM3 source (upstream synced)
├── docker/             # Docker configuration 
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── init-scripts/
├── custom/             # My custom modules
│   ├── reports/
│   └── api/
├── docs/               # Custom documentation
├── MODIFICATIONS.md    # Detailed change log
└── scripts/           # Deployment utilities
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
- `main` branch stays synced with upstream
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
???

### ASM3 Key Files
- ??? - Main application entry
- ??? - Web interface modules  
-  - Database abstraction
- ??? - Reporting system
- ??? - Business logic services

### Custom Integration Points
- Environment variables in `docker/.env`
- Custom modules in `custom/`
- Docker configuration in `docker/`
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