# TODO

Each item receives a generated tracking key when added. Reference the key in commits, discussions, and `MODIFICATIONS.md` updates. Track priority levels (`High`, `Medium`, `Low`) to guide scheduling.

## 1. [Q3V7KX] Restore Animal Selector on Hedgehog Observation Screen
**Priority**: Medium
**Requirements**
- Reproduce the issue at `/hedgehog_observation` when no `animal_id` parameter is supplied; capture console/network traces to confirm missing selector markup.
- Inspect the Hedgehog observation templates and JS initialisation to ensure an animal search/dropdown renders when the page loads without context.
- Implement a fix that surfaces a searchable animal picker (or redirect) consistent with upstream behaviour, and verify it works for users with `ACCESS_Hedgehog` permission.
- Add regression coverage (UI automation or unit test hook) and document the change in `MODIFICATIONS.md` once deployed.

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

## 4. [R9C5JP] Intermittent Login Requires Second Attempt
**Priority**: High
**Requirements**
- Capture reproduction steps for the double-login issue (browser, user role, timestamp) and collect console/network logs on the first failed attempt.
- Instrument authentication endpoints to trace session creation, CSRF tokens, and error handling paths to identify where the request drops without user feedback.
- Implement a fix that ensures the first login attempt succeeds or surfaces a clear error message to the user, and verify across supported browsers.
- Add monitoring/log alerts for repeated silent login failures and document the resolution in `MODIFICATIONS.md` plus operator runbooks.
