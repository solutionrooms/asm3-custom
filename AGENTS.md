# Repository Guidelines

## Project Structure & Module Organization
The Python entrypoint lives in `src/main.py`; scheduled jobs in `src/cron.py`. Core business logic sits under `src/asm3/`, while static assets and media files reside in `src/static/` and `src/media/`. Tests live in `unittest/` with fixtures in `scripts/unittestdb/`, and project-specific overrides go in `customizations/` or `custom_scripts/`.

## Build, Test, and Development Commands
Use `make help` to list all Makefile targets. `make build` builds the Docker images; `make start` and `make stop` manage the container lifecycle. For local debugging run `make o_test` (launches `src/main.py` on port 5000) and `make o_tests` to prep the SQLite fixture DB then execute `unittest/suite.py`.

## Coding Style & Naming Conventions
Follow PEP 8 with 4-space indents for Python; lint with `scripts/flake8`. JavaScript under `src/static/js/` uses 2-space indents, kebab-case filenames, and `npm run jshint`. Configuration changes should favor data-driven hooks in `customizations/` rather than touching `src/asm3/`.

## Testing Guidelines
Test modules are named `test_*.py` and should remain independent of one another. Run suites via `make o_tests` or `cd unittest && python3 suite.py`, which seeds the SQLite fixtures from `scripts/unittestdb/`. When altering schemas, review `schema_list.txt` and document updates in `MODIFICATIONS.md`.

## Commit & Pull Request Guidelines
Craft commits with imperative Conventional headers (e.g., `fix: adjust weight monitor retry`). Reference issues when available and note schema impacts. Pull requests should summarize the change, list validation steps, attach relevant logs or screenshots, and highlight any data migration or rollback steps; always update `MODIFICATIONS.md` when touching upstream files.

## Security & Configuration Tips
Set `ASM3_DEBUG=true` in `.env` only for local troubleshooting, and restart containers with `make stop && make start` after changing env vars. Before upgrades, capture a backup using `make backup`; restore with `make restore FILE=...`. For SSL, configure `NGINX_SERVER_NAME`, then run `make generate-ssl-config` followed by `make restart`.
