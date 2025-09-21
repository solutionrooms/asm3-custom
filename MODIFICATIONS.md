# MODIFICATIONS.md – Custom Change Log

> Reference guide for changes applied to ASM3 since the fork. Use this as the canonical map of what differs from upstream.

## Summary of Major Modifications
| Date (range) | Area | Headline | Reference |
| --- | --- | --- | --- |
| 2025-08-24 → 2025-08-25 | Application | Hedgehog patient induction workflow with dedicated permissions and UI | [Hedgehog Patient Induction Workflow](#hedgehog-patient-induction-workflow) |
| 2025-08-24 | Platform | Docker-first runtime (app, PostgreSQL, Redis, nginx) plus Makefile orchestration | [Containerised Runtime & Tooling](#containerised-runtime--tooling) |
| 2025-08-25 | Data Integrity | Unique animal-name constraint and aligned form field mappings | [Animal Data Integrity](#animal-data-integrity) |
| 2025-08-30 | Storage | S3-backed media storage and S3 mirroring for DB backups | [External Storage & Backups](#external-storage--backups) |
| 2025-09-01 | Operations | Cron hardening, single-table backup helpers, dev hot-reload mounts, weight monitor photo linking | [Operational Automation](#operational-automation) |
| 2025-09-07 | Application | Observations history poo sample column and Analysis tab with weight graph | [Observations & Analysis Enhancements](#observations--analysis-enhancements) |

---

## Application Features

### Hedgehog Patient Induction Workflow
**When**: 2025-08-24 → 2025-08-25 (branch `develop`)

**What changed**
- New Hedgehog menu and JSON endpoint (`src/asm3/html.py`, `src/main.py`) guarded by fresh `ACCESS_Hedgehog` permission (`src/asm3/users.py`, `src/static/js/roles.js`).
- Dedicated induction UI (`src/static/js/animal_induction.js`, supporting tweak in `src/static/js/animal.js`) with responsive two-column layout, colour-coded inspection cards, and save-only workflow.
- Automatic DOB estimation driven by age-range dropdown; inspection fields auto-render from `entryinspection*` keys.

**Why it matters**
- Streamlines hedgehog intake with species-specific defaults, field positioning, and redirect rules for animals in the "Induction" location.
- Ensures field mappings align with core ASM3 expectations (`internallocation`, `estimateddob`, etc.), preventing data loss.

**Permissions required**: `ACCESS_Hedgehog` + `ADD_ANIMAL`/`CHANGE_ANIMAL` for create/edit access.

### Observations & Analysis Enhancements
**When**: 2025-09-07 (branch `develop`)

- `src/static/js/animal_observations_history.js` now surfaces poo sample results in a dedicated column and includes logs that previously hid when only a sample was recorded.
- New "Analysis" tab (`src/static/js/header_edit_header.js`) loads `src/static/js/animal_analysis.js`, backed by `animal_analysis` and `animal_weight_graph` endpoints in `src/main.py`. Matplotlib renders a PNG weight graph, with client-side hover detail and a PNG fallback.

### Animal Data Integrity
**When**: 2025-08-25 (branch `develop`)

- Database migration `src/asm3/dbupdates/50001.py` enforces unique animal names (`animal_AnimalName_unique`); pre-migration script tidies duplicates (e.g., "Fidget" → "Fidget (2)").
- Application validators in `src/asm3/animal.py` raise user-friendly errors before the DB constraint fires.
- Patient induction form corrections ensure location, coordinator, coat type, and additional rescue fields persist.

### Security & Permissions
**When**: 2025-08-24 → 2025-08-25

- `ACCESS_Hedgehog` permission introduced and wired through the roles UI, keeping the new workflow behind explicit privilege checks.

---

## Platform & Operations

### Containerised Runtime & Tooling
**When**: 2025-08-24 (branch `develop`, commits `4c32e73ce`, `b7002695c`)

- Dockerfile (multi-stage Python build) plus `docker-compose.yml` for app, PostgreSQL, Redis, and nginx.
- Environment templating (`asm3.conf.template`, `.env.example`), nginx variants, and SSL helper scripts (`init-ssl.sh`, `renew-ssl.sh`).
- Make targets for container lifecycle, version reporting, and backup/restore flows.
- `postgres-optimization.conf` and `schema_list.txt` capture runtime tuning and schema reference.

### Operational Automation
**When**: 2025-09-01 (branch `develop`)

- Cron scripts in `custom_scripts/` resolve containers via Compose labels and call `docker exec` instead of relying on local `docker-compose` context. Backup directory defaults to `/var/backups/asm3` (override `ASM3_BACKUP_DIR`).
- Makefile adds `backup-table`/`restore-table` helpers and extends `backup`/`restore` targets for table-scoped operations, documented in `make help`.
- Dev hot-reload mounts (`docker-compose.yml`) mirror `weight_monitor.py` and `scripts/` into the container; apply via `make restart`.
- `weight_monitor.py` links weight entries to recently uploaded photos and logs pairings; it also shifts log output to `/var/log/asm3/weight-monitor.log`.

### External Storage & Backups
**When**: 2025-08-30 (branch `develop`)

- Media files can be stored in S3: `asm3.conf.template`, `.env.example`, `docker-compose.yml`, and `Dockerfile` (adds `boto3`) make DBFS storage fully env-driven.
- Make target `dbfs-migrate` runs `maint_switch_dbfs_storage` inside the container.
- External DB maintenance script (`custom_scripts/run-db-maintenance-external.sh`) uploads PostgreSQL dumps to S3 when `BACKUP_S3_ENABLED=true`; falls back to host AWS credentials or runs dockerised `amazon/aws-cli`.

---

## Tooling & Documentation

### Development Environment Guidance
**When**: 2025-08-24

- `CLAUDE.md`, `README.md`, and `BASE_README.md` expanded with Docker workflow, customization patterns, hot-reload notes, menu architecture, and onboarding guidance.

---

## Appendix

### Version & Branch State
- **ASM3 Base Version**: 50
- **Custom Version**: C1
- **Branches**: `main-custom` (upstream sync), `develop` (active custom work), feature branches per enhancement.

### Testing Checklist
- Patient induction create/edit flow (location redirects, validation).
- Permission matrix for Hedgehog module.
- Observations history poo sample visibility and Analysis tab rendering.
- Weight monitor photo linkage and logging.
- Table backup/restore operations.

### Future Enhancements (as captured on 2025-09-01)
- Additional induction reports.
- Mobile intake API endpoints.
- External veterinary integrations.
- Advanced workflow automation.
