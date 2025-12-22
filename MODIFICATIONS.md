# MODIFICATIONS.md – Custom Change Log

> Reference guide for changes applied to ASM3 since the fork. Use this as the canonical map of what differs from upstream.

## Summary of Major Modifications
| Date (range) | Area | Headline | Reference |
| --- | --- | --- | --- |
| 2025-08-24 → 2025-08-25 | Application | Hedgehog patient induction workflow with dedicated permissions and UI | [Hedgehog Patient Induction Workflow](#hedgehog-patient-induction-workflow) |
| 2025-08-24 | Platform | Docker-first runtime (app, PostgreSQL, Redis, nginx) plus Makefile orchestration | [Containerised Runtime & Tooling](#containerised-runtime--tooling) |
| 2025-08-25 | Data Integrity | Unique animal-name constraint and aligned form field mappings | [Animal Data Integrity](#animal-data-integrity) |
| 2025-10-20 | Application | Animal Tracker daily microchip sync | [Animal Tracker Sync](#animal-tracker-sync) |
| 2025-08-30 | Storage | S3-backed media storage and S3 mirroring for DB backups | [External Storage & Backups](#external-storage--backups) |
| 2025-09-01 | Operations | Cron hardening, single-table backup helpers, dev hot-reload mounts, weight monitor photo linking | [Operational Automation](#operational-automation) |
| 2025-09-07 | Application | Observations history poo sample column and Analysis tab with weight graph | [Observations & Analysis Enhancements](#observations--analysis-enhancements) |
| 2025-10-27 | Application | Forms menu with person-flag filtered internal submissions | [Forms Menu & Filters](#forms-menu--filters) |
| 2025-12-22 | Media | Video uploads on media tab with mobile-native pickers | [Media Upload Video Support](#media-upload-video-support) |
| 2025-12-22 | Application | Daily feeding screen with active diet view by location | [Daily Feeding Screen](#daily-feeding-screen) |

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
- Hedgehog daily observation screen keeps the animal selector visible (`src/static/js/hedgehog_observation.js`), ensuring `/hedgehog_observation` loads with a searchable picker even without context; regression hook added in `unittest/test_hedgehog.py`.

### Media Upload Video Support
**When**: 2025-12-22

- Media uploads now accept common phone video formats (MP4/MOV/M4V/3GP/3G2/WEBM) and set correct MIME types (`src/asm3/media.py`).
- Media UI allows video files, uses native mobile pickers, and shows a video icon thumbnail (`src/static/js/media.js`).
- Clicking a stored video now opens an in-app HTML5 player dialog with the media notes underneath (`src/static/js/media.js`).
- Nginx upload limit raised to 500MB to accommodate larger clips (`nginx.conf`, `nginx-ssl.conf`, `nginx-nossl.conf`, `nginx-simple.conf`, `nginx-ssl.conf.template`, `nginx-processed.conf`).
- Historical entry workflow introduced for hedgehog observations: dedicated endpoint (`hedgehog_observation_history` in `src/main.py`) honours custom observation dates, updated single-animal UI (`src/static/js/hedgehog_observation.js`), navigation entry from the multi-animal screen (`src/static/js/animal_observations.js`), and regression coverage in `unittest/test_hedgehog.py`.
- Historical mode bypasses clinician/poo confirmation prompts and the new binary flags (“Poo Sample Taken?”, “Clinician Alerted?”) display across single-entry, multi-entry, and history tables (`src/static/js/hedgehog_observation.js`, `src/static/js/animal_observations.js`, `src/static/js/animal_observations_history.js`).
- Options → Daily Observations now include a “Weight Gainer Entry?” flag per field; users in the Weight Gainer role only see flagged inputs on observation screens, and poo/clinician prompts are suppressed (`src/static/js/options.js`, `src/static/js/hedgehog_observation.js`, `src/static/js/animal_observations.js`, `src/asm3/configuration.py`, `src/main.py`).

### Daily Feeding Screen
**When**: 2025-12-22

- Added a dedicated Daily Feeding screen that lists on-shelter animals with their current diet, optional weight-based default diet display, and a per-day feeding confirmation/comments log, filterable by internal location (`src/main.py`, `src/static/js/animal_feeding.js`, `src/static/js/options.js`).
- New permission flag `VIEW_FEEDING` controls access and appears in role editing UI, with a new menu entry under Animals (`src/asm3/users.py`, `src/static/js/roles.js`, `src/asm3/html.py`).

### Low Access Volunteer Location Selection
**When**: 2025-12-20 (branch `develop`)

- Low Access Volunteer users are forced through a location selection screen on every login, with a warning about assigned areas and Clare notification (`src/main.py`, `src/static/js/change_location.js`).
- Added a Change Location menu item plus a confirmation step before switches; location changes update `users.LocationFilter` and write an audit log entry (`src/asm3/html.py`, `src/main.py`).
- Internal locations marked with “Exclude from view” in their description are omitted from the Low Access Volunteer picker and rejected on submission (`src/main.py`).

### Geocoding Fallback & Indicators
**When**: 2025-10-26 (branch `develop`)

- `src/asm3/geo.py` retries failed geocodes using postcode-only lookups, marking the stored hash with `POSTCODEONLY|` so the system knows the coordinates are approximate. The disk cache entry now reflects the fallback result and avoids hammering the provider.
 - `src/asm3/geo.py` retries failed geocodes using postcode-only lookups, marking the stored hash with `POSTCODEONLY|` so the system knows the coordinates are approximate. Unresolved `0,0` results are no longer cached, forcing fresh attempts whenever the record is viewed.
- The person record lat/long widget highlights approximations with a visual warning (`src/static/js/common_widgets.js`, `src/static/css/asm.css`), so staff know when precision is limited.

### Animal Tracker Sync
**When**: 2025-10-20 (branch `develop`)

- Daily cron now loads `customizations/src/animaltracker_sync.py` to register microchips on Animal Tracker for animals changed within the last N days (default 2).
- The sync uses the Animal Tracker registration flow (from `custom_scripts/bulk_upload_animaltracker.py`) and marks successes in `animalpublished` under `PublishedTo='animaltracker'`.
- Credentials and tuning flags (`ANIMALTRACKER_EMAIL`, `ANIMALTRACKER_PASSWORD`, optional lookback/throttle/debug/timeout) were added to `docker-compose.yml` for containerised runs.
- Interactive runs are available via `make run animaltracker` (set `ANIMALTRACKER_DEBUG=1` for verbose logging).
- Animal edit UI shows a “(synced)” or “(Not Synced)” indicator next to the primary microchip number based on whether an `animalpublished` entry exists for Animal Tracker; removed the microchip brand message and check-a-chip search button from the microchip field.
- Set `ANIMALTRACKER_DRY_RUN=1` to preview actions without registering or marking chips.
- Set `ANIMALTRACKER_ANIMALNAME=Name` to sync a single named animal on demand.
- Default selection now targets any unsynced animal with `IdentichipNumber`, `IdentichipDate`, and `DateOfBirth` present (including archived/off-shelter; excludes deceased).
- Convenience Make target: `make animaltracker [NAME=...] [DRY=1] [DEBUG=1] [LOOKBACK=0] [THROTTLE=1.0] [TIMEOUT=60] [RETRIES=2] [RETRY_SLEEP=2.0] [MAX=250] [DBNAME=asm3] [ALIAS=...]`.
- For multi-database installs, set `ANIMALTRACKER_TARGET_DBNAME` or `ANIMALTRACKER_TARGET_DBALIAS` so the nightly job only runs against one database.

### Forms Menu & Filters
**When**: 2025-10-27 (branch `develop`)

- New top-level **Forms** menu exposing internal online forms under a Submit form section; entries filter automatically by the logged-in person's flags against each form's Person Flags field (`src/asm3/onlineform.py`, `src/main.py`, `src/asm3/html.py`).
- Links open the live `online_form_html` service with the current account alias, while admin links for editing/incoming forms remain available from the same menu.
- Mobile navigation now uses the same filtered internal form list so menus stay consistent across UIs.

### Animal Data Integrity
**When**: 2025-08-25 (branch `develop`)

- Database migration `src/asm3/dbupdates/50001.py` enforces unique animal names (`animal_AnimalName_unique`); pre-migration script tidies duplicates (e.g., "Fidget" → "Fidget (2)").
- Application validators in `src/asm3/animal.py` raise user-friendly errors before the DB constraint fires.
- Patient induction form corrections ensure location, coordinator, coat type, and additional rescue fields persist.

### Security & Permissions
**When**: 2025-08-24 → 2025-08-25

- `ACCESS_Hedgehog` permission introduced and wired through the roles UI, keeping the new workflow behind explicit privilege checks.
- Login screen now detects unexpected HTML responses during authentication (typically when the session is bounced back to the login form) and surfaces an explicit error message instead of silently reloading.

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
- Host log storage relocated to `./logs/asm3` (rebased onto `/var/log/asm3` in containers). Make targets and external cron scripts now honour the directory via `LOCAL_LOG_DIR`/`ASM3_LOG_ROOT` so Docker no longer requires `/private/var/log` write access on macOS.
- `scripts/setup_swap.sh` provisions swap on the host (fallocate fallback, `/etc/fstab`, and swappiness tuning) to prevent the `asm3` container from being OOM-killed on low-RAM droplets.

### External Storage & Backups
**When**: 2025-08-30 (branch `develop`)

- Media files can be stored in S3: `asm3.conf.template`, `.env.example`, `docker-compose.yml`, and `Dockerfile` (adds `boto3`) make DBFS storage fully env-driven.
- Make target `dbfs-migrate` runs `maint_switch_dbfs_storage` inside the container.
- External DB maintenance script (`custom_scripts/run-db-maintenance-external.sh`) uploads PostgreSQL dumps to S3 when `BACKUP_S3_ENABLED=true`; falls back to host AWS credentials or runs dockerised `amazon/aws-cli`.
- Automated backups prune S3 objects to the most recent 100 dumps by default (tunable via `BACKUP_S3_KEEP_REMOTE`); logic is shared between `make backup` and the cron-triggered maintenance run.
- `custom_scripts/run-db-maintenance-external.sh` now delegates its backup phase to `backup-databases-external.sh`, so cron executes the same workflow (and retention) as `make backup` while still logging under `db-maintenance.log`.

---

## Tooling & Documentation

### Hedgehog Observation Inline Help
**When**: 2025-10-16

- Hedgehog daily observation screen shows contextual help icons for each weight-gainer field; hovering/clicking reveals guidance sourced from the weight gaining guide (including the stool consistency chart).
- Added an “Open Help Guide” action alongside the photo uploader and wired help buttons to deep-link into section 4 of `weight-gaining.html`.
- Updated the weight gaining guide with anchored field references and clarified photo handling through the Media tab.

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
