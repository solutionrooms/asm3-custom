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

## Log Locations
- Application and maintenance logs mount to `./logs/asm3` (binds to `/var/log/asm3` in the container).
- External cron helpers honour `ASM3_LOG_ROOT`; by default they also write to `./logs/asm3`.
- `make logs-*` targets and cron status commands read from the same directory.

## Host Operations

### Redeployment Checklist (Droplet / Production)
- `cd /root/asm3-custom && git pull` to pick up the latest custom changes.
- `npm ci` (host side) to sync Node dependencies with `package-lock.json`.
- `npm --silent run babel` to rebuild the compatibility bundle and fail fast if Babel is unhappy.
- `make js-rebundle` to regenerate the rollup bundle and restart the `asm3` service (requires Docker permission).
- Optional: `docker compose exec asm3 grep rollup_js /app/asm3.conf` should echo `rollup_js = true`.
- In a fresh/incognito browser session with cache disabled, hit the site and confirm you see a single `rollup*.js?b=<build>` request rather than many `?b=dev` files.

### Swap Provisioning
- The `asm3` container keeps Python and Matplotlib in memory; on 1–2 GB hosts it will be killed by the OOM killer unless swap is present.
- Run `sudo ./scripts/setup_swap.sh --size 4G` on the host to create or refresh a swap file (defaults to `/swapfile`, `vm.swappiness=10`).
- The script is idempotent, updates `/etc/fstab`, and applies the swappiness setting via `/etc/sysctl.d/99-asm3-swap.conf`.
- Verify with `swapon --show` and `cat /proc/swaps`; the `make restart` target is not required after swap activation.

## Key Customisations (See MODIFICATIONS.md for detail)
- Hedgehog patient induction workflow with dedicated permissions, responsive UI, and auto-mapped additional fields.
- Docker-first runtime with nginx, PostgreSQL, Redis, and SSL helpers managed via Make targets.
- S3-backed media storage, S3 mirroring for backups, and cron scripts that operate outside the repo directory.
- Weight analysis tooling including weight-history import, poo-sample import, and Analysis tab visualisations.

## Patient Induction System

This fork embeds a hedgehog-specific intake workflow.

### Additional Fields
Configure the following Additional Fields in ASM3 admin so the UI renders correctly:

```
entryagerange            Select    Baby (<1)|Juvenile (1-2)|Adult (2-5)|Senior (5+)
entrylocationweather     Select    Freezing|Cold|Warm|Hot
entrylocationdescription Memo
entryfoundbyperson       Person Link
entryinspection*         Select    No|Slight|Moderate|Severe (auto-detected)
```

### Workflow Notes
- Access the module via **Hedgehog → Patient Induction**; requires `ACCESS_Hedgehog`, plus `ADD_ANIMAL`/`CHANGE_ANIMAL` for mutations.
- Age range auto-calculates DOB, marks "Estimated DOB", and stores the inferred date.
- Inspection cards appear for any Additional Field prefixed `entryinspection`; severity changes update colours live.
- Animals held in the "Induction" location redirect to this screen until moved elsewhere.

## Data Import Utilities

### `custom_scripts/import_weights_history.py`
- CSV headers: `Date,Hedgehog,Location,Weight,Action,Next Weighing,Non insulated,Comments` (DD/MM/YYYY dates).
- Accepts weights like `1021g`, `1.02kg`, `2.2lb`; all values normalise to grams for storage.
- Key flags:
  - `--dry-run` – parse only; no writes.
  - `--include-archived` – match animals across all statuses.
  - `--delete-existing` – purge prior imports created by the same user handle.
- Example inside repo: `python custom_scripts/import_weights_history.py --csv raw_data/weights.csv --include-archived`.
- Container execution: `docker-compose exec asm3 sh -lc 'python3 /app/custom_scripts/import_weights_history.py --csv /app/raw_data/weights.csv --include-archived'`.

### `custom_scripts/import_poo_samples_history.py`
- CSV needs `Date,Patient Name` plus optional `Poo Sample - Cap|Fluke|Lungworm|Clear` columns.
- Stores results as `poo_sample_result=<value>` Daily Observations; duplicates skip automatically.
- Flags mirror the weights importer (`--dry-run`, `--include-archived`, `--delete-existing`).
- Example: `python custom_scripts/import_poo_samples_history.py --csv raw_data/poo_samples.csv --include-archived`.

Both scripts support direct DB credentials (`--db-type`, `--db-host`, etc.) or rely on the container configuration. For macOS logging issues, create a minimal `asm3_local.conf` with `log_location = stderr` and set `ASM3_CONF` before running.

## Support
Questions about upstream behaviour should reference the official ASM3 documentation. For fork-specific issues, open tickets against `develop` and document outcomes in `MODIFICATIONS.md`.
