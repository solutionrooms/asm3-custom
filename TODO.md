# TODO

Each item receives a generated tracking key when added. Reference the key in commits, discussions, and `MODIFICATIONS.md` updates. Track priority levels (`High`, `Medium`, `Low`) to guide scheduling.

## 1. [Q3V7KX] Restore Animal Selector on Hedgehog Observation Screen ✅
**Status**: Completed 2025-09-21
**Outcome**
- Animal chooser now always renders on `/hedgehog_observation`, pre-selects the current animal when present, and lets staff switch context without leaving the page.
- Added a controller regression hook (`unittest/test_hedgehog.py`) for the no-context response and documented the behaviour change in `MODIFICATIONS.md`.

## 2. [N5L2RM] Import Hedgehog Movements from CSV
**Priority**: High
**Requirements**
- Define the CSV schema (minimum: animal identifier, movement type, from/to locations, dates, notes) and validate headers before processing.
- Implement a custom script under `custom_scripts/` that authenticates against ASM3 and creates movements via the existing API/service layer, handling duplicate detection and idempotency.
- Provide dry-run mode, per-row success/error reporting, and summary statistics at completion; log failures with enough context to retry specific rows.
- Document CLI usage (local and Docker) in `README.md` and record the feature in `MODIFICATIONS.md` once shipped.

## 3. [T8H4GS] Standardise Weight Handling in Grammes
**Priority**: Medium
**Requirements**
- Introduce a configuration toggle (e.g., `USE_GRAMMES_FOR_WEIGHT`) exposed in admin/settings so units, labels, and calculations default to grammes instead of kilograms when enabled.
- Update all weight entry points (patient induction, observations, analysis graphs, import scripts, weight monitor) to honour the flag, converting incoming kg/lb data to grams and ensuring literals/tooltips reference `g`.
- Migrate existing UI text, templates, and reports that currently display "kg" to render grams when the toggle is active; provide fallback formatting when disabled.
- Add regression tests or fixtures confirming gram formatting, update relevant docs (`README.md`, `MODIFICATIONS.md`), and outline migration guidance for historical data if conversions are required.

## 4. [R9C5JP] Intermittent Login Requires Second Attempt ✅
**Status**: Completed 2025-09-21
**Outcome**
- Root cause traced to host OOM events killing the `asm3` container mid-request; login flow failed silently on the first attempt.
- Added `scripts/setup_swap.sh` and updated docs to provision host swap, eliminating repeated container restarts.
- Logs now stable and first-attempt logins succeed; resolution recorded in `README.md` and `MODIFICATIONS.md`.
