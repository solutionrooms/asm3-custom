Custom version of ASM
extra instructions here
for main instructions see BASE_README.md

## Custom Patient Induction System

This fork includes a specialized **Patient Induction** system designed for hedgehog rescue operations with modern UI and automated features.

### Key Features

#### 🎨 **Modern 2-Column Layout**
- Responsive card-based design with hover effects
- Organized sections: Basic Information, Animal Details, Location & Housing, etc.
- Mobile-responsive (automatically stacks on smaller screens)
- Professional gradient backgrounds and smooth transitions

#### 🔄 **Automatic Age Calculation**
- **Entry Age Range** dropdown with options: Baby (<1), Juvenile (1-2), Adult (2-5), Senior (5+)
- Automatically calculates estimated Date of Birth based on selected age range
- Sets "Estimated DOB" checkbox automatically
- Uses midpoint calculations (e.g., Baby = 6 months ago, Adult = 3.5 years ago)

#### 📍 **Found Location Tracking**
New section captures rescue context:
- **Weather Conditions**: Freezing, Cold, Warm, Hot dropdown
- **Found By**: Person lookup for rescue contact
- **Location Description**: Multi-line text field for detailed location notes

#### 🏥 **Dynamic Physical Inspection System**
- **Automatic Field Detection**: Any additional field starting with `entryinspection*` appears automatically
- **Severity Levels**: No, Slight, Moderate, Severe dropdown options
- **Color-Coded Cards**: Visual feedback with green/yellow/orange/red backgrounds
- **Responsive Grid**: Multi-column layout that adapts to screen size
- **Zero Maintenance**: Add new inspection fields in admin - they appear automatically

#### 🦔 **Hedgehog-Specific Optimizations**
- Species and Breed fields hidden (but still submitted for data integrity)
- Weight field moved to prominent position in Animal Details
- Base Color field repositioned for better workflow
- Streamlined form focused on hedgehog intake priorities

### Setup Instructions

#### 1. Additional Fields Configuration
Create additional fields in ASM3 Admin with these specifications:

**Custom Entry Fields:**
- `entryagerange` - Select - Options: Baby (<1)|Juvenile (1-2)|Adult (2-5)|Senior (5+)
- `entrylocationweather` - Select - Options: Freezing|Cold|Warm|Hot  
- `entrylocationdescription` - Multi-line Text
- `entryfoundbyperson` - Person Link

**Inspection Fields (automatically detected):**
- `entryinspectioncold` - Select - Options: No|Slight|Moderate|Severe
- `entryinspectiondehydrated` - Select - Options: No|Slight|Moderate|Severe  
- `entryinspectionunderweight` - Select - Options: No|Slight|Moderate|Severe
- Add more `entryinspection*` fields as needed - they auto-appear in inspection section

#### 2. Access the Patient Induction System
- Navigate to **Hedghog Menu → Patient Induction**
- Or access via URL: `/animal_induction` or `/patient_registration`
- Requires `ACCESS_HEDGHOG` permission

### Usage Workflow

1. **Basic Information**: Enter name, age range (auto-calculates DOB), sex
2. **Animal Details**: Type, color, coat, weight, size  
3. **Found Location**: Weather, finder contact, location details
4. **Entry Information**: Entry type, dates, fees
5. **Physical Inspection**: Multi-field assessment with visual severity indicators
6. **Save**: Creates animal record with all custom data

### Technical Notes

- Built on ASM3's tableform system with custom rendering
- Uses additional fields system for maintainable dropdowns
- jQuery-based interactivity with modern CSS Grid layouts
- Fully integrated with ASM3's validation and submission systems
- Custom styling with CSS-in-JS approach for component isolation

## Weights History Import

Import historical hedgehog weights from a CSV and save them as Daily Observation logs (same destination as the `hedgehog_observation` screen).

Script
- `custom_scripts/import_weights_history.py`
- Stores to `log` table (LinkType=ANIMAL) using the configured Daily Observations log type.
- Comments are saved as `key=value` pairs; `Weight` is stored as a numeric grams value (no unit).

CSV format
- Required columns (headers must match): `Date,Hedgehog,Location,Weight,Action,Next Weighing,Non insulated,Comments`
- Dates like `25/09/2022` (DD/MM/YYYY). Time set to local noon.
- Weights accepted: `1021g`, `1.02kg`, `1021`, `1,021g`, `2.2lb(s)` → stored as grams (e.g., `1021`). Bad values are reported and skipped.

Prerequisites (local)
- Python 3.12
- Packages: `pip install requests psycopg2-binary Pillow`

Basic usage (local, direct DB flags)
- Example:
  - `python custom_scripts/import_weights_history.py --csv "raw_data/weights export.csv" --include-archived --db-type POSTGRESQL --db-host localhost --db-port 5432 --db-name asm3 --db-user asm3 --db-pass asm3`
- Options:
  - `--dry-run`: parse and show actions, no DB writes
  - `--include-archived`: match animals by name across all animals (not only recent/on-shelter)
  - `--user USERNAME`: attribute created logs to this user (default: `weights-import`)
  - `--delete-existing`: delete previous logs created by `--user` for this log type before import (safe cleanup)
  - `--logtype ID`: override Daily Observations log type; defaults to configured `BehaveLogType`

Using repo config
- The repo `asm3.conf` reads DB settings from env vars; set and run:
  - `ASM3_CONF=$(pwd)/asm3.conf ASM3_DBHOST=localhost ASM3_DBPORT=5432 ASM3_DBNAME=asm3 ASM3_DBUSERNAME=asm3 ASM3_DBPASSWORD=asm3 \`
    `python custom_scripts/import_weights_history.py --csv "raw_data/weights export.csv" --include-archived`

Inside container (optional)
- Mount `raw_data` into the container or `docker cp` the CSV, then:
  - `docker-compose exec asm3 sh -lc 'python3 /app/custom_scripts/import_weights_history.py --csv "/app/raw_data/weights export.csv" --include-archived --delete-existing'`

Behavior & safeguards
- Duplicate guard: skips creating a log if an existing log for the same animal and date already has the same normalized weight.
- Deletion scope (`--delete-existing`): only removes logs with `CreatedBy = --user`, `LinkType = animal`, and the selected log type. Deletes are audited.
- Logging on macOS: if you see syslog errors, set a minimal config: create `/tmp/asm3_local.conf` with `log_location = stderr` and run with `ASM3_CONF=/tmp/asm3_local.conf`.

## Poo Samples Import

Import historical poo sample results and store them as Daily Observation logs.

Script
- `custom_scripts/import_poo_samples_history.py`
- Stores to `log` table (LinkType=ANIMAL) using the configured Daily Observations log type.
- Comments store a single `poo_sample_result` field with one of `Cap|Fluke|Lungworm|Clear`. If multiple are selected, joins with ` and ` (e.g., `Fluke and Cap`).

CSV format
- Required columns: `Date,Patient Name` plus any of `Poo Sample - Cap|Fluke|Lungworm|Clear`
- Extra blank columns are ignored; values are normalized; output uses `poo_sample_result` only.

Usage (local)
- Example:
  - `python custom_scripts/import_poo_samples_history.py --csv "raw_data/poo_samples_export.csv" --include-archived \`
    `--db-type POSTGRESQL --db-host localhost --db-port 5432 --db-name asm3 --db-user asm3 --db-pass asm3`
- Options:
  - `--dry-run`: parse/print actions only
  - `--include-archived`: match animals by name across all animals
  - `--user USERNAME`: attribute logs (default: `poo-import`)
  - `--delete-existing`: delete previous logs created by `--user` for this log type before import

Notes
- Duplicate guard: skips same-day entries with identical comment sets.
- macOS logging: use `ASM3_CONF=/tmp/asm3_local.conf` with `log_location = stderr` if needed.
