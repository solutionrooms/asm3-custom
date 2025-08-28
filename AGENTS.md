# Repository Guidelines

## local tools available
- ripgrep (rg) for fast search

## Project Structure & Module Organization
- `src/`: Python app (entry: `src/main.py`, jobs: `src/cron.py`), core under `src/asm3`, assets in `src/static/` and `src/media/`.
- `unittest/`: Python tests (`test_*.py`) run via `unittest/suite.py`; fixtures in `scripts/unittestdb/`.
- `scripts/`: Tooling and configs (`scripts/flake8`, `scripts/jshint.conf`, Docker helpers).
- Docker: `Dockerfile`, `docker-compose*.yml`; Makefile orchestrates Docker and legacy ASM3 tasks.
- Custom: `customizations/` (project code) and `custom_scripts/` (ops automation).
- Docs: `CLAUDE.md` (agent/dev notes), `MODIFICATIONS.md` (change log), `schema_list.txt` (DB reference).

## Build, Test, and Development Commands
- `make help`: Discover commands. `make build/start/stop/restart/dev`: container lifecycle and logs.
- `make logs`, `make logs-weight`, `make logs-db`: tail app/weight monitor/DB logs.
- `make o_test`: Run dev server (`src/main.py 5000`). `make o_tests`: prep test DB and run suite.
- JS: `npm run jshint | babel | minify` (see `package.json`).
- Versions: `make version`, `make list-versions`, `make upgrade`. Backup first: `make backup`; restore: `make restore FILE=...`.
- Note: Env changes require `make stop && make start` (not just restart). Enable debug with `ASM3_DEBUG=true` in `.env` (see CLAUDE.md).

## Coding Style & Naming Conventions
- Python: PEP 8; 4-space indents; snake_case; `flake8` config in `scripts/flake8`.
- JavaScript: `jshint` (config in `scripts/jshint.conf`), 2-space indents; kebab-case for file names under `src/static/js/`.
- Placement: Prefer `customizations/` and config-driven hooks; touch core sparingly and document in `MODIFICATIONS.md`.

## Testing Guidelines
- Runner: `make o_tests` or `cd unittest && python3 suite.py`.
- Structure: Independent `test_*.py` cases; cover business logic in `src/asm3/` and custom flows.
- DB: Tests use SQLite fixtures; when changing schema or migrations, review `schema_list.txt` and update docs as needed.

## Commit & Pull Request Guidelines
- Commits: Imperative subjects; conventional tags from CLAUDE.md (feat, fix, docs, docker, sync). Reference issues when relevant.
- PRs: Clear summary, rationale, test steps, and screenshots/logs for UI/ops. Call out DB changes, data migration/rollback, and update `MODIFICATIONS.md`.

## Agent & Configuration Notes
- Menu/UI entry points: see CLAUDE.md for `menu_structure()` in `src/asm3/html.py`, frontend JS paths, and localization updates.
- SSL: Set `NGINX_SERVER_NAME`, then `make generate-ssl-config` and `make restart`; `make init-ssl`/`make renew-ssl` for certificates.

## Local Test Credentials
- Dev login (local only): username `user`, password `letmein!!!`. Do not use in production.

## Upstream Sync
- Branch strategy: `main-custom` tracks upstream; `develop` for custom work.
- Sync example: `git fetch upstream && git checkout main && git merge upstream/main`.
