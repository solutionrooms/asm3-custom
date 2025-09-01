# MODIFICATIONS.md - Complete Log of ASM3 Custom Changes

> Comprehensive documentation of all modifications made to ASM3 for custom deployment

## 🚀 Major Features Added

### 1. Enhanced Patient Induction System (Hedgehog Module)
**Date**: 2025-08-24 to 2025-08-25  
**Branch**: develop  
**Latest Update**: 2025-08-25 (Major UI overhaul and feature additions)

#### Overview
Complete patient induction workflow system for hedgehog rescue operations with modern 2-column UI, automated calculations, and dynamic inspection system.

#### Files Modified:
- `src/asm3/html.py` - Added Hedgehog menu system
- `src/asm3/users.py` - Added ACCESS_Hedgehog permission
- `src/asm3/roles.js` - Added Hedgehog access permission to roles
- `src/main.py` - Added animal_induction endpoint class
- `src/static/js/animal_induction.js` - Complete patient induction interface (1,200+ lines)
- `src/static/js/animal.js` - Added redirect logic for Induction location animals

#### Key Features:

1. **Modern 2-Column Layout (NEW)**:
   - Responsive CSS Grid layout with 6 organized sections
   - Card-based design with hover effects and smooth transitions
   - Professional gradient backgrounds and color-coded sections
   - Mobile-responsive (auto-stacks to single column)
   - Custom CSS-in-JS styling for component isolation

2. **Automatic Age Calculation (NEW)**:
   - Entry Age Range dropdown: Baby (<1), Juvenile (1-2), Adult (2-5), Senior (5+)
   - Automatic DOB calculation using midpoint estimates
   - Auto-sets "Estimated DOB" checkbox when age range selected
   - Smart date arithmetic (Baby = 6mo ago, Adult = 3.5yr ago, etc.)

3. **Found Location Tracking (NEW)**:
   - Weather Conditions dropdown: Freezing, Cold, Warm, Hot
   - Found By person lookup field for contact management
   - Multi-line Location Description text area
   - Contextual rescue information capture

4. **Dynamic Physical Inspection System (NEW)**:
   - **Auto-Detection**: Any additional field starting with `entryinspection*` appears automatically
   - **Color-Coded Severity**: No (green), Slight (yellow), Moderate (orange), Severe (red)
   - **Responsive Grid**: Multi-column layout adapting to screen size
   - **Zero Maintenance**: Add fields in admin - they auto-appear in inspection section
   - **Visual Feedback**: Cards change color based on severity selection

5. **Hedgehog-Specific Optimizations (NEW)**:
   - Species and Breed fields hidden (but still submitted for data integrity)
   - Weight field moved to prominent position in Animal Details section
   - Base Color repositioned for better workflow
   - Streamlined UI focused on hedgehog intake priorities

6. **Workflow Integration**:
   - Animals in "Induction" location automatically redirect to Patient Induction screen
   - Location changes trigger appropriate navigation (Induction → Patient screen, Other → Standard animal screen)
   - Maintains workflow continuity throughout animal processing

7. **Data Management**:
   - Full form data validation and saving
   - Optimistic concurrency control (record versioning)
   - Support for all standard animal fields with proper mapping
   - Progress saving with minimal validation for interrupted workflows

#### Technical Implementation:
- **Backend**: JSONEndpoint class in main.py with controller/post_save methods
- **Frontend**: Complete jQuery-based form with AJAX save operations
- **Permissions**: Layered security (ACCESS_Hedgehog + ADD_ANIMAL/CHANGE_ANIMAL)
- **Field Mapping**: Corrected field name mismatches (internallocation→location, estimatedage→estimateddob, etc.)

#### User Permissions Required:
- `ACCESS_Hedgehog` - Access to Hedgehog menu and Patient Induction screen
- `ADD_ANIMAL` - Create new animals through Patient Induction
- `CHANGE_ANIMAL` - Edit existing animals through Patient Induction

---

## 🐳 Infrastructure Changes

### 2. Docker Containerization
**Date**: 2025-08-24  
**Branch**: develop  
**Commits**: 4c32e73ce, b7002695c  

#### Complete Docker implementation for ASM3:
- `Dockerfile` - Multi-stage Python application container
- `docker-compose.yml` - Full stack orchestration (app + PostgreSQL + Redis)
- `asm3.conf.template` - Environment-based configuration
- `.env.example` - Environment variables template
- `Makefile` - Docker management commands

#### Nginx Configuration:
- `nginx.conf` - Main nginx configuration
- `nginx-ssl.conf` - SSL/TLS enabled configuration  
- `nginx-simple.conf` - Basic HTTP configuration
- SSL certificate automation scripts (`init-ssl.sh`, `renew-ssl.sh`)

#### Database Optimization:
- `postgres-optimization.conf` - PostgreSQL performance tuning
- Schema documentation (`schema_list.txt`) - Complete database structure reference

#### Scripts & Automation:
- `weight_monitor.py` - Animal weight monitoring system
- Multiple maintenance scripts in `scripts/` directory
- Performance monitoring and log cleanup automation

### 2.1 Cron Scripts: Docker Exec by Labels (Robustness Fix)
**Date**: 2025-09-01  
**Summary**: Updated external cron scripts to resolve containers by Docker Compose service labels and use `docker exec` instead of relying on `docker-compose` in the project directory. Prevents false "containers are not running" errors when scripts are installed to `/usr/local/bin`.

#### Files Modified:
- `custom_scripts/run-daily-tasks-external.sh` — use `docker exec` on container with `com.docker.compose.service=asm3`.
- `custom_scripts/run-weight-monitor-external.sh` — same resolution as above.
- `custom_scripts/run-db-maintenance-external.sh` — resolve `asm3` and `postgres` by labels; backup dir now defaults to `/var/backups/asm3` (overridable via `ASM3_BACKUP_DIR`).
- `custom_scripts/monitor-system.sh` — remove `docker-compose` dependency; use `docker ps`/`docker logs` with label-based targeting.

#### Rationale:
Previous scripts assumed they were executed from within the repo (derived `PROJECT_DIR` from script location). After `make install-cron`, scripts live under `/usr/local/bin`, so `docker-compose ps` had no compose file context and erroneously reported containers as not running. Label-based resolution is project-name agnostic and works from any working directory.

---

### 2.2 Make: Single-Table Backup/Restore Helpers
**Date**: 2025-09-01  
**Summary**: Added convenient Make targets to back up or restore a single PostgreSQL table without dumping/restoring the whole database. Useful for moving data between environments selectively. Handles both custom-format archives and plain SQL; user is responsible for referential integrity.

#### Changes
- `Makefile`
  - Enhanced `backup` to support `make backup TABLE_NAME` (creates `backup_table_<table>_<timestamp>.dump`).
  - Added `backup-table` target (`make backup-table TABLE=name`).
  - Enhanced `restore` to support `make restore TABLE_NAME [FILE=...]` (restores only that table; defaults to latest matching `backup_table_*.dump` when `FILE` is omitted).
  - Added `restore-table` target (`make restore-table TABLE=name [FILE=...]`).
  - Updated `help` with usage examples.

#### Usage
- Backup entire DB: `make backup`
- Backup a table: `make backup animals` or `make backup-table TABLE=animals`
- Restore entire DB: `make restore FILE=backup_YYYYmmdd_HHMMSS.dump`
- Restore a table: `make restore animals [FILE=backup_table_animals_*.dump]` or `make restore-table TABLE=animals [FILE=...]`

Notes:
- For table restores, the command uses `pg_restore --clean --if-exists -t public.<table>` for `.dump` archives or pipes SQL into `psql` for `.sql` files.
- The app container is not stopped for table-only restores; manage application access/locks as needed.

## 📋 Field Name Corrections & Bug Fixes

### 3. Form Field Standardization  
**Date**: 2025-08-25  
**Issue**: Field name mismatches preventing data persistence

#### Fixes Applied:
1. **Location Field**: `internallocation` → `location` (matches standard animal form)
2. **Coordinator Field**: `coordinator` → `adoptioncoordinator` (matches standard animal form)  
3. **Date Handling**: `estimatedage` → `estimateddob` (estimated date of birth checkbox)
4. **Breed Picker**: Removed non-standard `breedp` field and related code
5. **Coat Type Reload**: Patient Induction now reads `animal.COATTYPE` (ID) instead of non-existent `COATTYPEID`, so selections like “Spikes” persist across saves.
6. **Robust Toggling**: Added missing row IDs `coattyperow` and `sizerow` so config options `AddAnimalsShowCoatType` and `AddAnimalsShowSize` work correctly.
7. **Induction Additional Mapping**: Mapped `entrylocationweather`, `entryfoundbyperson`, and `entrylocationdescription` to the additional-field saving pipeline so they persist when corresponding Additional Fields exist.
8. **Fosterer on Edit**: If a fosterer is selected while editing, the system creates a foster movement (when animal is on-shelter) to persist the choice.

#### Root Cause:
ASM3's `update_animal_from_form()` function expects specific field names. Mismatches caused:
- Data not saving (fields ignored)
- Location being nulled (field not found)
- Version conflicts on subsequent saves

#### Resolution:
Aligned all form field names with ASM3's standard animal form conventions, ensuring proper data persistence and workflow continuity.

---

## 🔧 Configuration & Documentation

### 4. Development Environment Setup
**Date**: 2025-08-24  
**Files**: `CLAUDE.md`, `README.md`, `BASE_README.md`

#### Enhanced Documentation:
- Complete Docker workflow documentation
- ASM3 customization patterns and best practices  
- Development environment setup guides
- Hot-reload configuration for efficient development
- Menu system architecture documentation
- Custom integration points and testing strategies

#### Configuration Management:
- Environment-based configuration system
- Development vs production settings separation
- Automated setup scripts (`initital_setup.sh`)
- Configuration processing automation

---

## 🛡️ Security & Permissions

### 5. Permission System Enhancement
**Files**: `src/asm3/users.py`, `src/static/js/roles.js`

#### Added Permissions:
- `ACCESS_Hedgehog = "ahh"` - Controls access to Hedgehog menu and Patient Induction functionality
- Integrated into role management interface for easy assignment

#### Security Model:
- Layered permission checking (menu access + operation permissions)
- Follows ASM3's existing permission patterns
- Maintains principle of least privilege

---

## 📊 Current State & Version

**ASM3 Base Version**: 50  
**Custom Version**: C1  
**Branch Strategy**: 
- `main-custom` - Synced with upstream ASM3
- `develop` - All custom modifications
- Feature branches for specific enhancements

**Total Changes**: 4,780 lines added, 201 lines removed across 39 files

### 6. Unique Animal Names Constraint  
**Date**: 2025-08-25  
**Branch**: develop  

#### Overview
Added database constraint and application validation to prevent duplicate animal names within the shelter system, providing user-friendly error messages when attempted.

#### Files Modified:
- `src/asm3/dbupdates/50001.py` - Database migration to add unique constraint on AnimalName
- `src/asm3/animal.py` - Added validation in `insert_animal_from_form` and `update_animal_from_form` functions
- `src/static/js/animal_induction.js` - Fixed field mapping issue (location → internallocation)

#### Key Features:
1. **Database Migration**:
   - Migration 50001 adds unique index on `animal.AnimalName` field
   - Pre-migration cleanup handles existing duplicates (renamed "Fidget" → "Fidget (2)")
   - Updates database version to 50001

2. **Application Validation**:
   - Added duplicate name checking in both insert and update operations
   - User-friendly error message: "Animal name '{name}' is already in use. Please choose a different name."
   - Validation occurs before database constraint to provide better user experience

3. **Field Mapping Fix**:
   - Patient Induction form field corrected from `location` to `internallocation`
   - Fixes issue where location was saved as NULL in Patient Induction
   - Both regular animal form and Patient Induction now use consistent field names

#### Technical Implementation:
- **Database**: Unique index `animal_AnimalName_unique` on `animal(AnimalName)`
- **Validation**: Pre-insert/update checks using `ASMValidationError` for user-friendly messages
- **Error Handling**: Catches duplicates at application level before database constraint violation

#### Testing Results:
- ✅ Database migration successful (version 35012 → 50001)
- ✅ Unique constraint working at database level
- ✅ Application validation catches duplicates with friendly error messages
- ✅ Field mapping issue resolved for Patient Induction location field

---

## 🔄 Maintenance Notes

### Upstream Sync Strategy:
1. Regularly sync `main-custom` with upstream ASM3
2. Rebase `develop` branch to maintain clean history  
3. Document all conflicts and resolutions
4. Test custom functionality after each sync

### Testing Checklist:
- [ ] Patient Induction workflow (create/edit animals)
- [ ] Location-based redirects working correctly
- [ ] Permission system functioning properly
- [ ] Data persistence across all form fields
- [ ] Multiple save operations without conflicts
- [ ] Menu system integration and navigation

### Future Enhancements:
- Additional custom reports for induction workflow
- API endpoints for mobile induction app
- Integration with external veterinary systems
- Advanced workflow automation

### 7. Patient Induction UI Overhaul & Dynamic Features
**Date**: 2025-08-25  
**Branch**: develop  

#### Overview
Major enhancement of the Patient Induction system with modern UI, automated calculations, and dynamic field detection for scalable inspection system.

#### Files Modified:
- `src/static/js/animal_induction.js` - Complete UI redesign (400+ lines added)

#### New Features Added:

1. **Modern 2-Column Responsive Layout**:
   - CSS Grid-based responsive design with 6 organized sections
   - Card-based UI with hover effects and smooth animations
   - Professional gradient backgrounds and color-coded themes
   - Mobile-first responsive design (auto-stacks on small screens)
   - Custom CSS-in-JS for component isolation

2. **Automatic Age-to-DOB Calculator**:
   ```javascript
   // Entry Age Range options: Baby (<1), Juvenile (1-2), Adult (2-5), Senior (5+)
   // Auto-calculates DOB using midpoint estimates
   Baby: 6 months ago, Juvenile: 18 months ago, Adult: 3.5 years ago, Senior: 7 years ago
   ```
   - Automatically sets "Estimated DOB" checkbox
   - Integrates with existing form validation

3. **Found Location Context Section**:
   - Weather Conditions: Freezing|Cold|Warm|Hot dropdown
   - Found By: Person lookup with rescue contact management
   - Location Description: Multi-line text for detailed rescue context
   - Visual callouts explaining field purposes

4. **Dynamic Physical Inspection System**:
   ```javascript
   // Auto-detects additional fields starting with 'entryinspection*'
   render_inspection_fields() // Scans controller.additional for matching fields
   init_inspection_styling() // Applies color-coded severity theming
   ```
   - **Zero-config expansion**: Add `entryinspection*` fields in admin → they auto-appear
   - **Color-coded severity**: No (green), Slight (yellow), Moderate (orange), Severe (red)
   - **Responsive grid**: Multi-column layout adapts to field count and screen size

5. **Hedgehog-Specific Workflow Optimizations**:
   - Species/Breed fields hidden but still submitted (data integrity maintained)
   - Weight field moved to Animal Details section (prominent placement)
   - Base Color repositioned for logical workflow
   - Removed Create/Create+Edit buttons (Save-only workflow)

#### Technical Architecture:

**Dynamic Field Detection**:
```javascript
// Automatic additional field rendering
$.each(controller.additional, function(i, field) {
    if (field.FIELDNAME && field.FIELDNAME.toLowerCase().startsWith('entryinspection')) {
        // Auto-render in inspection grid with color coding
    }
});
```

**Responsive CSS Grid System**:
```css
.form-section { 
    display: grid; 
    grid-template-columns: 1fr 1fr; 
    gap: 30px; 
}
.inspection-grid { 
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
}
```

**Visual State Management**:
```javascript
// Real-time color coding based on severity selection
$(select).change(function() {
    const item = $(this).closest('.inspection-item');
    item.removeClass('inspection-no inspection-slight inspection-moderate inspection-severe');
    item.addClass('inspection-' + $(this).val().toLowerCase());
});
```

#### Required Additional Fields Setup:
```
entryagerange - Select - Baby (<1)|Juvenile (1-2)|Adult (2-5)|Senior (5+)
entrylocationweather - Select - Freezing|Cold|Warm|Hot  
entrylocationdescription - Multi-line Text
entryfoundbyperson - Person Link
entryinspection* - Select - No|Slight|Moderate|Severe (auto-detected)
```

#### Benefits:
- **Maintainable**: Dropdown values managed centrally in ASM3 admin
- **Scalable**: Add inspection fields without code changes
- **Modern UX**: Professional interface matching current web standards
- **Workflow Optimized**: Hedgehog-specific field organization
- **Responsive**: Works on all device sizes

---

**Last Updated**: 2025-08-25  
**Documentation Status**: Complete  
**Testing Status**: Functional testing completed

---

## 🖼️ S3 Media Storage (DBFS → S3)
**Date**: 2025-08-30  
**Branch**: develop

### Overview
Enable storing images/documents in S3 instead of the database. Configuration is driven by environment variables to keep secrets out of the repo.

### Changes
- `Dockerfile`: Add `boto3` to Python dependencies to support S3 client usage by `src/asm3/dbfs.py`.
- `asm3.conf.template`: Switch DBFS settings to env-driven values and add S3 config placeholders (`dbfs_s3_*`).
- `docker-compose.yml`: Pass new `ASM3_DBFS_*` environment variables into the container.
- `.env.example`: Add `ASM3_DBFS_STORE` and S3-related env variables for secure configuration.
- `Makefile`: Add `dbfs-migrate` target to run `maint_switch_dbfs_storage` inside the container.

### Usage
- Set in `.env`: `ASM3_DBFS_STORE=s3`, `ASM3_DBFS_S3_BUCKET=...`, and optionally access keys/endpoint (or rely on IAM/role/instance creds).
- Apply config: `make stop && make start`
- Migrate existing files: `make dbfs-migrate`

### Rationale: Why `asm3.conf.template`?
- We generate the runtime `asm3.conf` via `envsubst` on container start, so secrets live in `.env` (or orchestrator secrets), not in a committed config file.
- Keeps a single portable template across environments (dev/staging/prod) without editing the file for each environment.
- The committed `asm3.conf` file is retained for non-Docker/local workflows; Docker uses the generated `/app/asm3.conf`.

---

## 💾 Database Backups Mirrored to S3
**Date**: 2025-08-30  
**Branch**: develop

### Overview
Extend external DB maintenance cron to upload created PostgreSQL backups to an S3 bucket (separate from media bucket). Uses `.env` for credentials and falls back to host AWS profile/role if keys not set.

### Changes
- `custom_scripts/run-db-maintenance-external.sh`: After creating `backups/backup_*.dump`, optionally uploads to `s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/` when `BACKUP_S3_ENABLED=true`.
  - Uses local `aws` CLI if installed; otherwise runs dockerized `amazon/aws-cli` image.
  - Supports custom endpoint via `BACKUP_S3_ENDPOINT_URL` for S3-compatible providers.
- `.env.example`: Added `BACKUP_S3_*` variables.

### Configure
- Set in `.env`:
  - `BACKUP_S3_ENABLED=true`
  - `BACKUP_S3_BUCKET=your-backup-bucket`
  - Optional: `BACKUP_S3_PREFIX=asm3/backups`, `BACKUP_S3_REGION=eu-west-1`, `BACKUP_S3_ENDPOINT_URL=https://...`
  - Optional creds: `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (prefer IAM/profile on host)

### Notes
- Retention: local keeps last 3 backups; manage S3 retention via bucket lifecycle rules.
- Cron: Use `make install-cron` to schedule `custom_scripts/run-db-maintenance-external.sh` daily.
