# ASM3 Custom Deployment

Customised fork of ASM3 for hedgehog rescue operations. Core setup, usage, and upstream documentation remain in `BASE_README.md`; all change history is tracked in `MODIFICATIONS.md`.

## Quick Start
- Review `BASE_README.md` for install, Docker workflow, and environment setup.
- Use `make help` to list available commands; common targets include `make build`, `make start`, `make stop`, `make o_test`, and `make o_tests`.
- Populate `.env` from `.env.example` before running containers.

## Documentation Map
- `MODIFICATIONS.md` – Canonical list of custom features, infra changes, and operational tooling.
- `CLAUDE.md` – Agent/developer onboarding notes and menu structure reference.
- `schema_list.txt` – Database schema snapshot used by automated scripts.
- `customizations/`, `custom_scripts/` – All project-specific code is isolated here to ease upstream rebases.

## Key Customisations (See MODIFICATIONS.md for detail)
- Hedgehog patient induction workflow with dedicated permissions, responsive UI, and auto-mapped additional fields.
- Docker-first runtime with nginx, PostgreSQL, Redis, and SSL helpers managed via Make targets.
- S3-backed media storage, S3 mirroring for backups, and cron scripts that operate outside the repo directory.
- Weight analysis tooling including weight-history import, poo-sample import, and Analysis tab visualisations.

## Data Import Utilities
Two automation scripts live in `custom_scripts/` and can be run locally or inside the container. Both honour Dry Run mode and support credential flags identical to the base CLI tools.

### `import_weights_history.py`
- Ingests CSV weight history and writes Daily Observation logs with normalised gram values.
- Duplicate guard skips entries where an animal already has the same weight logged on that date.
- Example: `python custom_scripts/import_weights_history.py --csv raw_data/weights.csv --include-archived`

### `import_poo_samples_history.py`
- Parses CSV poo sample results and stores them as observations with `poo_sample_result` comments.
- Optional `--delete-existing` removes prior imports created by the same user handle.
- Example: `python custom_scripts/import_poo_samples_history.py --csv raw_data/poo_samples.csv --include-archived`

## Support
Questions about upstream behaviour should reference the official ASM3 documentation. For fork-specific issues, open tickets against `develop` and document outcomes in `MODIFICATIONS.md`.
