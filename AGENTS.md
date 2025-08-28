# Repository Guidelines

## Project Structure & Module Organization
- src/: Python application (entrypoints: `src/main.py`, `src/cron.py`), core modules under `src/asm3`, web assets under `src/static/` and `src/media/`.
- unittest/: Python unit tests (`test_*.py`) with custom runner `suite.py`.
- scripts/: Dev tooling and configs (e.g., `scripts/flake8`, `scripts/jshint.conf`, docker helpers).
- Dockerfile, docker-compose*.yml: Containerization and runtime.
- Makefile: Primary developer workflow (Docker + original ASM3 tasks).
- customizations/, custom_scripts/: Local extensions and automation.

## Build, Test, and Development Commands
- make build: Build Docker images.
- make start | make stop | make restart: Run and manage the stack.
- make logs | make logs-weight | make logs-db: Tail app/weight monitor/DB logs.
- make dev: Quick cycle (build, start, logs).
- make o_test: Run the Python dev server (`src/main.py 5000`).
- make o_tests: Prepare test DB and run unit tests (`unittest/suite.py`).
- npm run jshint | npm run babel | npm run minify: Lint, transpile, and minify JS (see `package.json`).

## Coding Style & Naming Conventions
- Python: PEP 8 via `flake8` (config: `scripts/flake8`). Use 4-space indents; snake_case for functions/vars, PascalCase for classes.
- JavaScript: `jshint` (config: `scripts/jshint.conf`). Prefer const/let, 2-space indents, kebab-case for file names in `src/static/js/`.
- Files/paths: Keep custom code in `customizations/` or `custom_scripts/` when possible to ease upgrades.

## Testing Guidelines
- Framework: Project-specific runner in `unittest/suite.py` (sqlite fixtures in `scripts/unittestdb/`).
- Naming: Tests as `test_*.py` with small, independent cases.
- Run: `make o_tests` (recommended) or `cd unittest && python3 suite.py`.
- Coverage: Aim for meaningful coverage on business logic (models, services) under `src/asm3/`.

## Commit & Pull Request Guidelines
- Commits: Use imperative, concise subjects (e.g., "Fix X", "Refactor Y"). Group related changes; keep noise minimal. Reference issues with `#id` when applicable.
- PRs: Include summary, rationale, testing steps, and screenshots/logs for UI or operational changes. Link related issues and note migration/rollback steps.

## Security & Configuration Tips
- .env: Do not commit real secrets; use `.env.example` as a template.
- SSL/NGINX: Update `NGINX_SERVER_NAME` then `make generate-ssl-config` and `make restart`. Use `make init-ssl`/`make renew-ssl` as needed.
- Backups: `make backup` before upgrades; restore with `make restore FILE=...`.
