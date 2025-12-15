
# ASM3 Docker Management Makefile
# Combined original ASM3 commands (prefixed with o_) and Docker management commands

LOCAL_LOG_DIR ?= ./logs/asm3
LOCAL_LOG_DIR_ABS := $(abspath $(LOCAL_LOG_DIR))
.PHONY: help build start stop restart logs logs-weight logs-cron logs-db clean cleanup update backup restore backup-table restore-table clear-cache shell version upgrade list-versions init-ssl renew-ssl ssl-status ssl-auto-renew ssl-stop-renew generate-ssl-config install-cron uninstall-cron status-cron testdata run animaltracker animaltracker-records db-init db-copy db-reset-password check_weights fix_weights js-clean

ifeq ($(firstword $(MAKECMDGOALS)),db-init)
  DB_INIT_ARG := $(word 2,$(MAKECMDGOALS))
  ifneq ($(DB_INIT_ARG),)
$(DB_INIT_ARG):
	@:
  endif
endif

ifeq ($(firstword $(MAKECMDGOALS)),db-copy)
  DB_COPY_SRC := $(word 2,$(MAKECMDGOALS))
  DB_COPY_DST := $(word 3,$(MAKECMDGOALS))
  ifneq ($(DB_COPY_SRC),)
$(DB_COPY_SRC):
	@:
  endif
  ifneq ($(DB_COPY_DST),)
$(DB_COPY_DST):
	@:
  endif
endif

ifeq ($(firstword $(MAKECMDGOALS)),db-reset-password)
  DB_RESET_ALIAS := $(word 2,$(MAKECMDGOALS))
  DB_RESET_USER := $(word 3,$(MAKECMDGOALS))
  DB_RESET_PASS := $(word 4,$(MAKECMDGOALS))
  ifneq ($(DB_RESET_ALIAS),)
$(DB_RESET_ALIAS):
	@:
  endif
  ifneq ($(DB_RESET_USER),)
$(DB_RESET_USER):
	@:
  endif
  ifneq ($(DB_RESET_PASS),)
$(DB_RESET_PASS):
	@:
  endif
endif

# Default target - show help
help:
	@echo "ASM3 Docker Management Commands:"
	@echo ""
	@echo "Docker Operations:"
	@echo "  build         - Build the Docker images"
	@echo "  start         - Start the application"
	@echo "  stop          - Stop the application"
	@echo "  restart       - Restart the application"
	@echo "  logs          - Show application logs"
	@echo "  logs-weight   - Show weight monitor logs"
	@echo "  logs-cron     - Show all cron job logs"
	@echo "  logs-db       - Show database maintenance logs"
	@echo "  dbfs-migrate  - Move existing DBFS files to current storage (eg, S3)"
	@echo "  dbfs-reupload-cache - Re-upload S3 objects from disk cache (one-off repair)"
	@echo "  dbfs-migrate-safe - Synchronous DBFS -> S3 migration (no VACUUM, no threads)"
	@echo "  clean         - Stop and remove all containers and volumes"
	@echo "  cleanup       - Clean up Docker space and log files"
	@echo "  update        - Update ASM3 base and rebuild"
	@echo "  backup        - Backup DB; or 'make backup TABLE' for single table"
	@echo "  backup-table  - Backup a single table (usage: make backup-table TABLE=name)"
	@echo "  restore       - Restore DB from FILE; use TARGET_DB=name to pick destination"
	@echo "  restore-table - Restore a single table (TABLE=name [FILE=...] [TARGET_DB=...])"
	@echo "  db-init <db>  - Ensure a database exists and install the ASM3 schema"
	@echo "  db-copy <src> <dst> - Back up <dst>, recreate it, and copy all data from <src>"
	@echo "  db-reset-password <alias> <user> <newpass> - Change a user's password in the given database"
	@echo "  clear-cache   - Clear application cache and restart"
	@echo "  rebuild-all   - Rebundle JS, rebuild image (no cache), restart"
	@echo "  js-rebundle   - Rebundle JS only and restart (fast)"
	@echo "  js-clean      - Remove generated JS bundles (rollup* and compat), no rebuild"
	@echo "  schema-refresh - Regenerate schema.js inside Docker and rebundle"
	@echo "  check_weights - Report weights by range (g) inside postgres (TARGET=animals|observations, default animals)"
	@echo "  fix_weights   - Normalize weights into 50–2000g (TARGET=animals|observations, default animals)"
	@echo "  shell         - Open shell in ASM3 container"
	@echo "  db-shell      - Open database shell"
	@echo "  animaltracker - Run Animal Tracker sync (NAME=..., DRY=1, DEBUG=1, LOOKBACK=0, DBNAME=asm3, TIMEOUT=60, ALIAS=...)"
	@echo "  animaltracker-records - Sync Animal Tracker records into micro table (MICRO_TABLE=micro, DRY=1, DEBUG=1, DBNAME=asm3, ALIAS=...)"
	@echo "  run <task>    - Run utility tasks inside containers (see below)"
	@echo "                 Tasks: weightmonitor, daily, animaltracker, db-maintenance, backup"
	@echo "  testdata      - Generate test data (usage: make testdata TYPE COUNT)"
	@echo "                  Types: animals, people"
	@echo "  version       - Show current ASM3 version"
	@echo "  list-versions - List available ASM3 versions"
	@echo "  upgrade       - Interactive upgrade to new version"
	@echo ""
	@echo "SSL Management:"
	@echo "  init-ssl      - Initialize SSL certificates with Let's Encrypt"
	@echo "  renew-ssl     - Manually renew SSL certificates"
	@echo "  ssl-status    - Check SSL certificate status"
	@echo "  generate-ssl-config - Generate nginx SSL config from template"
	@echo "  ssl-auto-renew - Start SSL auto-renewal background service"
	@echo "  ssl-stop-renew - Stop SSL auto-renewal background service"
	@echo ""
	@echo "Cron Management (VM-based):"
	@echo "  install-cron  - Install cron jobs on the VM host"
	@echo "  uninstall-cron - Remove cron jobs from the VM host"
	@echo "  status-cron   - Show cron job status and logs"
	@echo ""
	@echo "Original ASM3 Commands (prefixed with o_):"
	@echo "  o_all         - Complete build: clean, compile, tags, rollup, schema"
	@echo "  o_test        - Run development server on port 5000"
	@echo "  o_tests       - Run unit test suite"
	@echo "  o_compile     - Compile/lint JavaScript and Python"
	@echo "  o_compilepy   - Lint Python code only"
	@echo "  o_compilejs   - Lint JavaScript code only"
	@echo "  o_rollup      - Bundle and minify JavaScript files"
	@echo "  o_schema      - Generate database schema for SQL editing"
	@echo "  o_clean       - Clean build artifacts and cache files"
	@echo "  o_version     - Stamp build version and date"
	@echo "  o_deps        - Install system dependencies"
	@echo "  o_dist        - Create distribution packages"
	@echo "  o_translation - Build locale/translation files"
	@echo ""
	@echo "Note: Database maintenance (3:00 AM) includes VACUUM/ANALYZE + automated backups"
	@echo ""

# Build the Docker images
build:
	docker-compose build

# Rebundle JS, regenerate schema and version, rebuild image without cache and restart
rebuild-all:
	@echo "Rebundling JS, stamping version, generating schema..."
	@echo "Installing/updating Node dependencies..."
	npm install
	$(MAKE) o_all
	@echo "Rebuilding Docker image without cache..."
	docker-compose build --no-cache asm3
	@echo "Restarting application..."
	docker-compose up -d asm3
	@echo "Done. Consider hard-refreshing your browser."

# Fast path for UI changes: rebuild JS bundle and restart container
js-rebundle:
	@echo "Rebundling JavaScript (compat + rollup)..."
	@echo "Installing/updating Node dependencies..."
	npm install
	$(MAKE) o_rollup
	@echo "Restarting application..."
	docker-compose restart asm3
	@echo "Done. If using rollup_js, the new bundle is now active."

# Remove generated JS bundles (rollup* and compat). Regenerate with make js-rebundle.
js-clean:
	@echo "Removing generated JS bundles..."
	rm -f src/static/js/bundle/rollup.min.js src/static/js/bundle/rollup_compat.min.js
	rm -rf src/static/js/compat
	@echo "Done. Run 'make js-rebundle' to regenerate."

# Report weight distribution (grams) from the selected table
# Usage: make check_weights [DETAILS=1] [TARGET=animals|observations]
check_weights:
	@TARGET="$(TARGET)"; \
	TABLE=$$( [ "$$TARGET" = "observations" ] && echo "animal_weight_history" || echo "animal" ); \
	DETAIL_COLS=$$( [ "$$TARGET" = "observations" ] && echo "animalid, weight_date, weight, username" || echo "id, animalname, weight" ); \
	echo "Weight counts ($$TABLE.weight):"; \
	docker-compose exec -T postgres psql -U asm3 -d asm3 -c "SELECT \
      COUNT(*) FILTER (WHERE weight = 0 OR weight IS NULL) AS zero_or_null, \
      COUNT(*) FILTER (WHERE weight > 0 AND weight < 2)    AS below_2, \
      COUNT(*) FILTER (WHERE (weight >= 0.002 AND weight <= 0.005) OR (weight >= 2 AND weight < 50) OR (weight >= 2000 AND weight <= 50000)) AS between_2_50_scaled, \
      COUNT(*) FILTER (WHERE weight >= 50 AND weight <= 2000)   AS between_50_2000, \
      COUNT(*) FILTER (WHERE weight > 50000)                AS above_50000 \
    FROM $$TABLE;"; \
	if [ "$(DETAILS)" = "1" ]; then \
	  echo ""; \
	  echo "Out-of-range weights (weight < 50 or > 2000, skipping zero/null) from $$TABLE:"; \
	  docker-compose exec -T postgres psql -U asm3 -d asm3 -c "SELECT $$DETAIL_COLS FROM $$TABLE WHERE weight IS NOT NULL AND weight <> 0 AND (weight < 50 OR weight > 2000) ORDER BY weight;"; \
	  echo ""; \
	  echo "Error-range weights (weight >= 2 and < 50) from $$TABLE:"; \
	  docker-compose exec -T postgres psql -U asm3 -d asm3 -c "SELECT $$DETAIL_COLS FROM $$TABLE WHERE weight IS NOT NULL AND weight <> 0 AND ((weight >= 0.002 AND weight <= 0.005) OR (weight >= 2 AND weight < 50) OR (weight >= 2000 AND weight <= 50000)) ORDER BY weight;"; \
	fi

# Normalize weights into the 50–2000g range (skip zero and error-range rows)
# - Multiply by 1000 if weight < 50 (likely kg)
# - Divide by 1000 if weight > 2000 (likely grams but too large)
fix_weights:
	@TARGET="$(TARGET)"; \
	TABLE=$$( [ "$$TARGET" = "observations" ] && echo "animal_weight_history" || echo "animal" ); \
	echo "Normalizing $$TABLE.weight into 50–2000g (skipping zero/null)..."; \
	docker-compose exec -T postgres psql -U asm3 -d asm3 -c "UPDATE $$TABLE \
    SET weight = CASE \
                   WHEN weight > 0    AND weight < 50   THEN weight * 1000 \
                   WHEN weight > 2000                   THEN weight / 1000 \
                   ELSE weight \
                 END \
    WHERE weight IS NOT NULL \
      AND weight <> 0 \
      AND (weight < 50 OR weight > 2000) \
      AND NOT (weight >= 0.002 AND weight <= 0.005) \
      AND NOT (weight >= 2 AND weight < 50) \
      AND NOT (weight >= 2000 AND weight <= 50000);"

schema-refresh:
	@echo "Regenerating schema metadata inside Docker..."
	@docker-compose exec asm3 bash -lc 'python3 /app/scripts/schema/make_db.py --output /tmp/schema.db'
	@docker-compose exec asm3 bash -lc 'python3 /app/scripts/schema/schema.py --db /tmp/schema.db' > src/static/js/bundle/schema.js
	@$(MAKE) js-rebundle
	@echo "Schema refresh complete."

# Start the application
start:
	@mkdir -p $(LOCAL_LOG_DIR)
	@./scripts/process-nginx-config.sh
	docker-compose up -d

# Stop the application
stop:
	docker-compose down

# Restart the application (useful after making customizations)
restart:
	@./scripts/process-nginx-config.sh
	docker-compose restart
	@echo "Note: For .env changes, use 'make stop && make start' instead"

# Show logs (follow mode)
logs:
	docker-compose logs -f asm3

# Show weight monitor logs
logs-weight:
	docker-compose exec asm3 tail -f /var/log/asm3/weight-monitor.log

# Show all cron job logs (daily tasks and weight monitor)
logs-cron:
	docker-compose exec asm3 tail -f /var/log/asm3/daily-tasks.log /var/log/asm3/weight-monitor.log

# Show database maintenance logs
logs-db:
	tail -f $(LOCAL_LOG_DIR)/db-maintenance.log

# Clean up everything (WARNING: This removes all data!)
clean:
	@echo "WARNING: This will remove all containers and data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker-compose down -v
	docker system prune -f

# Clean up Docker space and log files
cleanup:
	@echo "🧹 Cleaning Docker..."
	docker system prune -f
	docker volume prune -f
	docker builder prune -f --keep-storage=256MB
	@echo ""
	@echo "🧹 Cleaning log files..."
	@find $(LOCAL_LOG_DIR) -name "*.log" -type f -exec truncate -s 0 {} \; 2>/dev/null || echo "  No host log files to clean"
	@docker-compose exec asm3 find /var/log -name "*.log" -type f -exec truncate -s 0 {} \; 2>/dev/null || echo "  Container not running - log cleanup skipped"
	@echo ""
	@echo "✅ Docker cleanup complete!"
	docker system df

# Update ASM3 base version and rebuild
update:
	@echo "Updating ASM3 base version..."
	docker-compose down
	docker-compose build --no-cache asm3
	docker-compose up -d
	@echo "Update complete!"

# Backup database or a single table (compressed format)
backup:
	@TABLE="$(word 2,$(MAKECMDGOALS))"; \
	if [ -n "$$TABLE" ] && [ "$$TABLE" != "backup" ]; then \
		SAFE_TABLE=$$(echo "$$TABLE" | tr -c '[:alnum:]_\n\r' '_'); \
		BACKUP_FILE="backup_table_$$(echo $$SAFE_TABLE)_$$(date +%Y%m%d_%H%M%S).dump"; \
		echo "Creating compressed backup for table: $$TABLE -> $$BACKUP_FILE"; \
		docker-compose exec -T postgres pg_dump -U asm3 -Fc -t "public.$$TABLE" asm3 > "$$BACKUP_FILE"; \
		echo "Table backup created: $$BACKUP_FILE"; \
	else \
		echo "Creating compressed database backups for all configured databases..."; \
		bash custom_scripts/backup-databases-external.sh; \
	fi

# Explicit: backup a single table (same as `make backup TABLE`)
backup-table:
	@if [ -z "$(TABLE)" ]; then \
		echo "Usage: make backup-table TABLE=name"; \
		exit 1; \
	fi; \
	SAFE_TABLE=$$(echo "$(TABLE)" | tr -c '[:alnum:]_\n\r' '_'); \
	BACKUP_FILE="backup_table_$${SAFE_TABLE}_$$(date +%Y%m%d_%H%M%S).dump"; \
	echo "Creating compressed backup for table: $(TABLE) -> $$BACKUP_FILE"; \
	docker-compose exec -T postgres pg_dump -U asm3 -Fc -t "public.$(TABLE)" asm3 > "$$BACKUP_FILE"; \
	echo "Table backup created: $$BACKUP_FILE"

db-init:
	@set -- $(MAKECMDGOALS); shift; \
	DBNAME="$(if $(DB),$(DB),$${1:-})"; \
	if [ -z "$$DBNAME" ]; then \
		echo "Usage: make db-init <database>"; \
		exit 1; \
	fi; \
	echo "Initialising ASM3 database '$$DBNAME'..."; \
	if ! docker-compose exec postgres psql -U asm3 -tc "SELECT 1 FROM pg_database WHERE datname='$$DBNAME'" | tr -d '[:space:]' | grep -q 1; then \
		echo "Creating database '$$DBNAME'..."; \
		docker-compose exec postgres psql -U asm3 -c "CREATE DATABASE \"$$DBNAME\" ENCODING 'UTF8' TEMPLATE template0"; \
	fi; \
	echo "Installing schema and default data (this may take a moment)..."; \
	docker-compose exec -e TARGET_DB_NAME="$$DBNAME" asm3 python -c "import os, sys, asm3.db, asm3.dbupdate; db_name=os.environ['TARGET_DB_NAME']; db_type=os.environ.get('ASM3_DBTYPE','POSTGRESQL').upper(); dbo=asm3.db.get_dbo(db_type); dbo.host=os.environ.get('ASM3_DBHOST','postgres'); dbo.port=int(os.environ.get('ASM3_DBPORT','5432')); dbo.username=os.environ.get('ASM3_DBUSERNAME','asm3'); dbo.password=os.environ.get('ASM3_DBPASSWORD',''); dbo.database=db_name; dbo.installpath='/app/src/'; dbo.has_structure() and (print(f\"Database '{db_name}' already contains ASM3 objects; skipping install.\"), sys.exit(0)); asm3.dbupdate.install(dbo)"
	echo "Database '$$DBNAME' is ready."

db-copy:
	@set -- $(MAKECMDGOALS); shift; \
	SRC="$(if $(FROM),$(FROM),$${1:-})"; \
	DEST="$(if $(TO),$(TO),$${2:-})"; \
	if [ -z "$$SRC" ] || [ -z "$$DEST" ]; then \
		echo "Usage: make db-copy <source_db> <target_db>"; \
		exit 1; \
	fi; \
	if [ "$$SRC" = "$$DEST" ]; then \
		echo "Source and target databases must be different."; \
		exit 1; \
	fi; \
	echo "Preparing to copy database from '$$SRC' to '$$DEST'..."; \
	if docker-compose exec postgres psql -U asm3 -tc "SELECT 1 FROM pg_database WHERE datname='$$DEST'" | tr -d '[:space:]' | grep -q 1; then \
		BACKUP_FILE="backup_$${DEST}_$$(date +%Y%m%d_%H%M%S).dump"; \
		echo "Backing up existing '$$DEST' to $$BACKUP_FILE"; \
		docker-compose exec -T postgres pg_dump -U asm3 -Fc "$$DEST" > "$$BACKUP_FILE"; \
	else \
		echo "Target database '$$DEST' does not exist yet; skipping backup."; \
	fi; \
	echo "Recreating database '$$DEST'..."; \
	docker-compose exec postgres psql -U asm3 -c "DROP DATABASE IF EXISTS \"$$DEST\""; \
	docker-compose exec postgres psql -U asm3 -c "CREATE DATABASE \"$$DEST\" ENCODING 'UTF8' TEMPLATE template0"; \
	echo "Copying data from '$$SRC' to '$$DEST'..."; \
	docker-compose exec postgres bash -lc "set -euo pipefail; pg_dump -U asm3 -Fc \"$$SRC\" | pg_restore -U asm3 -d \"$$DEST\" --no-owner --no-privileges"; \
	echo "Database '$$DEST' now matches '$$SRC'."

db-reset-password:
	@set -- $(MAKECMDGOALS); shift; \
	ALIAS="$(if $(DB),$(DB),$${1:-})"; \
		CLI_USER="$(if $(filter command\ line override,$(origin USER)),$(USER),)"; \
		ENV_USER="$(if $(filter environment environment\ override,$(origin USER)),$(USER),)"; \
		TARGET_USER="$${2:-$$CLI_USER}"; \
		if [ -z "$$TARGET_USER" ] && [ -n "$$ENV_USER" ]; then \
			TARGET_USER="$$ENV_USER"; \
		fi; \
		PASS="$(if $(PASS),$(PASS),$${3:-})"; \
		if [ -z "$$ALIAS" ] || [ -z "$$TARGET_USER" ] || [ -z "$$PASS" ]; then \
			echo "Usage: make db-reset-password <database_alias> <username> <new_password>"; \
			echo "   or: make db-reset-password DB=alias USER=name PASS=newpass"; \
			exit 1; \
		fi; \
		echo "Resetting password for user '$$TARGET_USER' in database '$$ALIAS'..."; \
		docker-compose exec -T asm3 python3 /app/scripts/reset_password.py "$$ALIAS" "$$TARGET_USER" "$$PASS"
	echo "Password reset complete."

reset_database:
	@set -- $(MAKECMDGOALS); shift; \
	ALIAS="$(if $(DB),$(DB),$${1:-})"; \
	if [ -z "$$ALIAS" ]; then \
		echo "Usage: make reset_database <database_alias>"; \
		echo "   or: make reset_database DB=alias"; \
		exit 1; \
	fi; \
	echo "Resetting operational data for database alias '$$ALIAS'..."; \
	docker-compose exec -T asm3 python3 /app/scripts/reset_database.py "$$ALIAS"
	echo "Database '$$ALIAS' reset complete."

# Restore database or a single table from backup file (POSIX sh, single shell)
restore:
	@sh -e -c '\
	  set -x; \
	  TABLE="$(word 2,$(MAKECMDGOALS))"; \
	  if [ -n "$$TABLE" ] && [ "$$TABLE" != "restore" ]; then \
	    SAFE_TABLE=$$(echo "$$TABLE" | tr -c "[:alnum:]_" "_"); \
	    TARGET_DB_NAME=$${TARGET_DB:-asm3}; \
	    FILE_IN="$(FILE)"; \
	    if [ -z "$$FILE_IN" ]; then \
	      FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.dump 2>/dev/null | head -1 || true); \
	      [ -n "$$FILE_IN" ] || FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.sql 2>/dev/null | head -1 || true); \
	    fi; \
	    echo "DEBUG: Mode=table TABLE=$$TABLE FILE_IN=$$FILE_IN"; \
	    if [ -z "$$FILE_IN" ]; then \
	      echo "Usage: make restore $$TABLE [FILE=path_to_table_backup.(dump|sql)] [TARGET_DB=target_db_name]"; \
	      echo "  No FILE provided and no matching backup_table_$${SAFE_TABLE}_*.dump found."; \
	      exit 1; \
	    fi; \
	    if [ ! -f "$$FILE_IN" ]; then \
	      echo "Error: Backup file $$FILE_IN not found"; \
	      exit 1; \
	    fi; \
	    echo "WARNING: This will drop and recreate table public.$$TABLE in database $$TARGET_DB_NAME."; \
	    printf "Are you sure you want to restore table %s from %s? [y/N] " "$$TABLE" "$$FILE_IN"; \
	    read -r confirm; \
	    if [ "$$confirm" = "y" ]; then \
	      if echo "$$FILE_IN" | grep -q "\\.dump$$"; then \
	        cat "$$FILE_IN" | docker-compose exec -T postgres pg_restore -U asm3 -d "$$TARGET_DB_NAME" --clean --if-exists -t "public.$$TABLE"; \
	      else \
	        cat "$$FILE_IN" | docker-compose exec -T postgres psql -U asm3 -d "$$TARGET_DB_NAME"; \
	      fi; \
	      echo "Table restore complete!"; \
	    else \
	      echo "Table restore cancelled."; \
	    fi; \
	  else \
	    if [ -z "$(FILE)" ]; then \
	      echo "Usage: make restore FILE=backup_file.dump [SOURCE_DB=source_db_name] [TARGET_DB=target_db_name]"; \
	      echo "  FILE: Path to backup file"; \
	      echo "  SOURCE_DB: Original database name (if different from asm3)"; \
	      echo "  TARGET_DB: Database inside postgres container to restore into (default asm3)"; \
	      echo "Available backup files:"; \
	      ls -la backup_*.dump backup_*.sql 2>/dev/null || echo "No backup files found"; \
	      exit 1; \
	    fi; \
	    if [ ! -f "$(FILE)" ]; then \
	      echo "Error: Backup file $(FILE) not found"; \
	      exit 1; \
	    fi; \
	    SOURCE_DB_NAME=$${SOURCE_DB:-asm3}; \
	    TARGET_DB_NAME=$${TARGET_DB:-asm3}; \
	    echo "DEBUG: Mode=full FILE=$(FILE) SOURCE_DB_NAME=$$SOURCE_DB_NAME TARGET_DB_NAME=$$TARGET_DB_NAME"; \
	    echo "WARNING: This will overwrite the current database!"; \
	    echo "Source database: $$SOURCE_DB_NAME -> Target database: $$TARGET_DB_NAME"; \
	    printf "Are you sure you want to restore from %s? [y/N] " "$(FILE)"; \
	    read -r confirm; \
	    if [ "$$confirm" = "y" ]; then \
	      echo "Stopping ASM3 application..."; \
	      docker-compose stop asm3; \
	      echo "Dropping existing database..."; \
	      if ! docker-compose exec -T postgres psql -U asm3 -d postgres -c "DROP DATABASE IF EXISTS \"$$TARGET_DB_NAME\";"; then \
	        echo "ERROR: Failed to drop database. Check for active connections (e.g., pgAdmin)."; \
	        docker-compose start asm3; \
	        exit 1; \
	      fi; \
	      echo "Creating new database..."; \
	      if ! docker-compose exec -T postgres psql -U asm3 -d postgres -c "CREATE DATABASE \"$$TARGET_DB_NAME\";"; then \
	        echo "ERROR: Failed to create database."; \
	        docker-compose start asm3; \
	        exit 1; \
	      fi; \
	      echo "Restoring from backup..."; \
	      if echo "$(FILE)" | grep -q "\\.dump$$"; then \
	        if [ "$$SOURCE_DB_NAME" != "$$TARGET_DB_NAME" ]; then \
	          echo "Note: Restoring from database $$SOURCE_DB_NAME to $$TARGET_DB_NAME"; \
	        fi; \
	        cat "$(FILE)" | docker-compose exec -T postgres pg_restore -U asm3 -d "$$TARGET_DB_NAME" --clean --if-exists; \
	      else \
	        cat "$(FILE)" | docker-compose exec -T postgres psql -U asm3 -d "$$TARGET_DB_NAME"; \
	      fi; \
	      echo "Starting ASM3 application..."; \
	      docker-compose start asm3; \
	      echo "Restore complete!"; \
	    else \
	      echo "Restore cancelled."; \
	    fi; \
	  fi'

# Explicit: restore a single table (same as `make restore TABLE [FILE=...]`)
restore-table:
	@sh -e -c '\
	  set -x; \
	  if [ -z "$(TABLE)" ]; then \
	    echo "Usage: make restore-table TABLE=name [FILE=path_to_table_backup.(dump|sql)] [TARGET_DB=target_db_name]"; \
	    exit 1; \
	  fi; \
	  SAFE_TABLE=$$(echo "$(TABLE)" | tr -c "[:alnum:]_" "_"); \
	  TARGET_DB_NAME=$${TARGET_DB:-asm3}; \
	  FILE_IN="$(FILE)"; \
	  if [ -z "$$FILE_IN" ]; then \
	    FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.dump 2>/dev/null | head -1 || true); \
	    [ -n "$$FILE_IN" ] || FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.sql 2>/dev/null | head -1 || true); \
	  fi; \
	  echo "DEBUG: Mode=table-only TABLE=$(TABLE) FILE_IN=$$FILE_IN"; \
	  if [ -z "$$FILE_IN" ]; then \
	    echo "Error: No matching backup found for table $(TABLE) and no FILE provided."; \
	    echo "  Expected pattern: backup_table_$${SAFE_TABLE}_*.dump (.sql supported too)"; \
	    exit 1; \
	  fi; \
	  if [ ! -f "$$FILE_IN" ]; then \
	    echo "Error: Backup file $$FILE_IN not found"; \
	    exit 1; \
	  fi; \
	  echo "WARNING: This will drop and recreate table public.$(TABLE) in database $$TARGET_DB_NAME."; \
	  printf "Are you sure you want to restore table %s from %s? [y/N] " "$(TABLE)" "$$FILE_IN"; \
	  read -r confirm; \
	  if [ "$$confirm" = "y" ]; then \
	    if echo "$$FILE_IN" | grep -q "\\.dump$$"; then \
	      cat "$$FILE_IN" | docker-compose exec -T postgres pg_restore -U asm3 -d "$$TARGET_DB_NAME" --clean --if-exists -t "public.$(TABLE)"; \
	    else \
	      cat "$$FILE_IN" | docker-compose exec -T postgres psql -U asm3 -d "$$TARGET_DB_NAME"; \
	    fi; \
	    echo "Table restore complete!"; \
	  else \
	    echo "Table restore cancelled."; \
	  fi'

# Clear application cache and restart
clear-cache:
	@echo "Clearing application cache..."
	@echo "  - Stopping ASM3 to clear memory cache..."
	docker-compose stop asm3
	@echo "  - Checking for memcached processes..."
	-docker-compose exec asm3 pkill memcached 2>/dev/null || true
	@echo "  - Starting ASM3..."
	docker-compose start asm3
	@echo "Cache cleared and application restarted!"

# Open shell in ASM3 container
shell:
	docker-compose exec asm3 bash

# Open database shell
db-shell:
	docker-compose exec postgres psql -U asm3 -d asm3

# Normalize historical animal weights to grams
normalize-weights:
	@echo "Normalizing animal weights (kg ↔ g)..."
	docker-compose exec postgres psql -v ON_ERROR_STOP=1 -U asm3 -d asm3 \
		-c "BEGIN;" \
		-c "UPDATE animal SET weight = weight / 1000000.0 WHERE weight >= 3000000000;" \
		-c "UPDATE animal SET weight = weight / 1000.0 WHERE weight >= 3000 AND weight < 3000000000;" \
		-c "UPDATE animal SET weight = weight * 1000000.0 WHERE weight > 0 AND weight < 0.0001;" \
		-c "UPDATE animal SET weight = weight * 1000.0 WHERE weight > 0 AND weight < 1;" \
		-c "COMMIT;"
	docker-compose exec postgres psql -U asm3 -d asm3 -c "SELECT id, animalname, weight FROM animal WHERE weight > 0 AND (weight < 100 OR weight > 3000) ORDER BY weight;"
	@echo "Weight normalization complete. See above for any remaining out-of-range weights."

# Quick development workflow
dev: build start logs

# Check if everything is running
status:
	docker-compose ps

# Migrate DBFS storage to the current backend (eg, after switching to S3)
dbfs-migrate:
	@echo "Running DBFS storage migration (maint_switch_dbfs_storage)..."
	docker-compose exec asm3 sh -lc 'ASM3_CONF=/app/asm3.conf python3 /app/src/cron.py maint_switch_dbfs_storage'
	@echo "Done. Check logs if any errors occurred: make logs"

# One-off repair: upload missing S3 objects using disk cache contents
dbfs-reupload-cache:
	@echo "Uploading missing S3 objects from disk cache..."
	docker-compose exec asm3 sh -lc 'ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/reupload_dbfs_s3_from_cache.py'
	@echo "Done. Check logs if any errors occurred: make logs"

# Safe synchronous migration using a custom script that uploads each file and then updates DBFS URL
dbfs-migrate-safe:
	@echo "Running safe DBFS -> S3 migration..."
	docker-compose exec asm3 sh -lc 'ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/migrate_dbfs_to_s3.py'
	@echo "Done. Check logs if any errors occurred: make logs"

# Show current ASM3 version
version:
	@echo "Current ASM3 version in .env:"
	@grep "ASM3_VERSION=" .env || echo "ASM3_VERSION not set in .env"
	@echo ""
	@echo "Version in running container:"
	@docker-compose exec asm3 cat /app/VERSION 2>/dev/null || echo "Container not running or VERSION file not found"

# List available ASM3 versions
list-versions:
	@echo "Fetching available ASM3 versions..."
	@git ls-remote --tags https://github.com/sheltermanager/asm3.git | \
		grep -E "refs/tags/v[0-9]+" | \
		sed 's/.*refs\/tags\///' | \
		sort -V | \
		tail -10
	@echo ""
	@echo "To see all versions: git ls-remote --tags https://github.com/sheltermanager/asm3.git"

# Interactive upgrade process
upgrade:
	@echo "Current version: $(grep ASM3_VERSION= .env | cut -d= -f2)"
	@echo ""
	@make list-versions
	@echo ""
	@read -p "Enter new version (e.g., v50): " new_version; \
	if [ -n "$new_version" ]; then \
		echo "Updating .env to use $new_version..."; \
		sed -i.bak "s/ASM3_VERSION=.*/ASM3_VERSION=$new_version/" .env; \
		echo "Creating backup before upgrade..."; \
		make backup; \
		echo "Rebuilding with new version..."; \
		docker-compose down; \
		docker-compose build --no-cache asm3; \
		echo "Starting with new version..."; \
		docker-compose up -d; \
		echo "Upgrade complete! Check logs with: make logs"; \
	else \
		echo "Upgrade cancelled."; \
	fi

# SSL Operations
init-ssl:
	@echo "Initializing SSL certificates..."
	@./init-ssl.sh

renew-ssl:
	@echo "Renewing SSL certificates..."
	@./renew-ssl.sh

ssl-status:
	@echo "Checking SSL certificate status..."
	@DOMAIN=$$(grep "^NGINX_SERVER_NAME=" .env | cut -d= -f2); \
	docker-compose exec nginx openssl x509 -in /etc/letsencrypt/live/$$DOMAIN/cert.pem -text -noout | grep -E "(Subject:|Not After)" || echo "SSL certificate not found or nginx not running"

# Start SSL auto-renewal service
ssl-auto-renew:
	@echo "Starting SSL auto-renewal service..."
	@docker-compose -f docker-compose.ssl.yml up -d

# Stop SSL auto-renewal service  
ssl-stop-renew:
	@echo "Stopping SSL auto-renewal service..."
	@docker-compose -f docker-compose.ssl.yml down

# Generate nginx SSL configuration from template
generate-ssl-config:
	@echo "Generating nginx SSL configuration..."
	@DOMAIN=$$(grep "^NGINX_SERVER_NAME=" .env | cut -d= -f2); \
	if [ -z "$$DOMAIN" ]; then \
		echo "❌ ERROR: NGINX_SERVER_NAME not found in .env file"; \
		exit 1; \
	fi; \
	if [ -f "nginx-ssl.conf.template" ]; then \
		echo "🔧 Creating SSL config for $$DOMAIN..."; \
		sed "s/NGINX_SERVER_NAME_PLACEHOLDER/$$DOMAIN/g" nginx-ssl.conf.template > nginx-processed.conf; \
		echo "✅ Generated nginx-processed.conf with SSL configuration"; \
		echo "💡 Run 'make restart' to apply the new configuration"; \
	else \
		echo "❌ ERROR: nginx-ssl.conf.template not found"; \
		exit 1; \
	fi

# Install cron jobs on VM host (runs outside containers)
install-cron:
	@echo "Installing ASM3 cron jobs on VM host..."
	@echo "Copying external scripts to /usr/local/bin/..."
	@sudo cp custom_scripts/run-daily-tasks-external.sh /usr/local/bin/asm3-daily-tasks
	@sudo cp custom_scripts/run-weight-monitor-external.sh /usr/local/bin/asm3-weight-monitor
	@sudo cp custom_scripts/run-db-maintenance-external.sh /usr/local/bin/asm3-db-maintenance
	@sudo cp custom_scripts/monitor-system.sh /usr/local/bin/asm3-monitor-system
	@sudo cp custom_scripts/cleanup-logs.sh /usr/local/bin/asm3-cleanup-logs
	@sudo chmod +x /usr/local/bin/asm3-daily-tasks /usr/local/bin/asm3-weight-monitor /usr/local/bin/asm3-db-maintenance /usr/local/bin/asm3-monitor-system /usr/local/bin/asm3-cleanup-logs
	@echo "Creating log directory..."
	@mkdir -p $(LOCAL_LOG_DIR_ABS)
	@echo "Installing cron jobs..."
	@(crontab -l 2>/dev/null | grep -v -E "(^# ASM3 |asm3-daily-tasks|asm3-weight-monitor|asm3-db-maintenance|asm3-monitor-system|asm3-cleanup-logs)"; \
	  echo "# ASM3 Daily Tasks - Runs at 2:00 AM every day"; echo "0 2 * * * /usr/local/bin/asm3-daily-tasks"; \
	  echo "# ASM3 Weight Monitor - Runs every minute"; echo "* * * * * /usr/local/bin/asm3-weight-monitor"; \
	  echo "# ASM3 Database Maintenance - Runs at 3:00 AM every day"; echo "0 3 * * * /usr/local/bin/asm3-db-maintenance"; \
	  echo "# ASM3 System Monitoring - Runs every 5 minutes"; echo "*/5 * * * * /usr/local/bin/asm3-monitor-system"; \
	  echo "# ASM3 Log Cleanup - Runs daily at 1:00 AM"; echo "0 1 * * * /usr/local/bin/asm3-cleanup-logs") | crontab -
	@echo "Cron jobs installed successfully!"
	@echo "Use 'make status-cron' to check status"

# Remove cron jobs from VM host
uninstall-cron:
	@echo "Removing ASM3 cron jobs from VM host..."
	@crontab -l 2>/dev/null | grep -v -E "(^# ASM3 |asm3-daily-tasks|asm3-weight-monitor|asm3-db-maintenance|asm3-monitor-system|asm3-cleanup-logs)" | crontab - || true
	@sudo rm -f /usr/local/bin/asm3-daily-tasks /usr/local/bin/asm3-weight-monitor /usr/local/bin/asm3-db-maintenance /usr/local/bin/asm3-monitor-system /usr/local/bin/asm3-cleanup-logs
	@echo "Cron jobs removed successfully!"

# Show cron job status and recent logs
status-cron:
	@echo "========================================"
	@echo "Current Cron Jobs:"
	@echo "========================================"
	@crontab -l 2>/dev/null | grep -E "(asm3-daily-tasks|asm3-weight-monitor|asm3-db-maintenance)" || echo "No ASM3 cron jobs found"
	@echo ""
	@echo "========================================"
	@echo "Cron Service Status:"
	@echo "========================================"
	@systemctl status cron --no-pager --lines=5
	@echo ""
	@echo "========================================"
	@echo "Recent Daily Tasks Log (last 20 lines):"
	@echo "========================================"
	@tail -20 $(LOCAL_LOG_DIR)/daily-tasks.log 2>/dev/null || echo "No daily tasks log found"
	@echo ""
	@echo "========================================"
	@echo "Recent Weight Monitor Log (last 20 lines):"
	@echo "========================================"
	@tail -20 $(LOCAL_LOG_DIR)/weight-monitor.log 2>/dev/null || echo "No weight monitor log found"
	@echo ""
	@echo "========================================"
	@echo "Recent Database Maintenance Log (last 20 lines):"
	@echo "========================================"
	@tail -20 $(LOCAL_LOG_DIR)/db-maintenance.log 2>/dev/null || echo "No database maintenance log found"

# Monitor system performance
monitor:
	@echo "Running system performance check..."
	@/usr/local/bin/asm3-monitor-system || echo "Monitor script not installed. Run 'make install-cron' first."

# Analyze performance trends
analyze:
	@echo "Analyzing performance trends..."
	@custom_scripts/analyze-performance.sh || echo "Analysis script not found"

# Show recent monitoring data
monitor-status:
	@echo "Recent System Metrics:"
	@echo "======================"
	@tail -10 $(LOCAL_LOG_DIR)/system-metrics-$(date +%Y-%m-%d).log 2>/dev/null || echo "No metrics for today"
	@echo ""
	@echo "Recent System Events:"
	@echo "====================="
	@tail -10 $(LOCAL_LOG_DIR)/system-events-$(date +%Y-%m-%d).log 2>/dev/null || echo "No events for today"

# Run helper dispatcher
run:
	@if [ -z "$(filter-out run,$(MAKECMDGOALS))" ]; then \
		echo "Usage: make run <task>"; \
		echo "Tasks:"; \
		echo "  weightmonitor   - Run weight monitor now"; \
		echo "  daily           - Run all daily tasks now"; \
		echo "  animaltracker   - Run Animal Tracker microchip sync now"; \
		echo "  db-maintenance  - Run VACUUM (VERBOSE, ANALYZE)"; \
		echo "  backup          - Create database backup"; \
		echo ""; \
		echo "Tip: Prefer 'make animaltracker' for options."; \
		exit 1; \
	fi; \
	TASK=$(word 2,$(MAKECMDGOALS)); \
	if [ "$$TASK" = "weightmonitor" ]; then \
		echo "Running weight monitor..."; \
		docker-compose exec asm3 python3 /app/weight_monitor.py; \
	elif [ "$$TASK" = "daily" ]; then \
		echo "Running daily tasks..."; \
		docker-compose exec asm3 python3 /app/src/cron.py all; \
	elif [ "$$TASK" = "animaltracker" ]; then \
		$(MAKE) animaltracker; \
	elif [ "$$TASK" = "db-maintenance" ]; then \
		echo "Running database VACUUM (VERBOSE, ANALYZE)..."; \
		bash custom_scripts/run-db-maintenance-external.sh; \
	elif [ "$$TASK" = "backup" ]; then \
		$(MAKE) backup; \
	else \
		echo "Error: Unknown task '$$TASK'"; \
		echo "Supported: weightmonitor, daily, animaltracker, db-maintenance, backup"; \
		exit 1; \
	fi

# Run Animal Tracker microchip sync with easy-to-remember options:
# - NAME="Max" to run one animal by exact name (case/whitespace-insensitive)
# - DRY=1 to preview (no login/registration/DB writes)
# - DEBUG=1 for verbose HTTP debug logging
# - LOOKBACK=2 (days), THROTTLE=1.0 (seconds), TIMEOUT=20 (seconds)
animaltracker:
	@echo "Running Animal Tracker microchip sync..."; \
	echo "Options: NAME=\"...\" DRY=1 DEBUG=1 LOOKBACK=0 THROTTLE=1.0 TIMEOUT=60 RETRIES=2 RETRY_SLEEP=2.0 MAX=250 DBNAME=asm3 ALIAS=\"...\""; \
	docker-compose exec \
	  -e ANIMALTRACKER_ANIMALNAME="$(NAME)" \
	  -e ANIMALTRACKER_DRY_RUN="$(DRY)" \
	  -e ANIMALTRACKER_DEBUG="$(DEBUG)" \
	  -e ANIMALTRACKER_LOOKBACK_DAYS="$(LOOKBACK)" \
	  -e ANIMALTRACKER_THROTTLE_SECONDS="$(THROTTLE)" \
	  -e ANIMALTRACKER_HTTP_TIMEOUT="$(or $(TIMEOUT),60)" \
	  -e ANIMALTRACKER_HTTP_RETRIES="$(RETRIES)" \
	  -e ANIMALTRACKER_HTTP_RETRY_SLEEP="$(RETRY_SLEEP)" \
	  -e ANIMALTRACKER_MAX_PER_RUN="$(MAX)" \
	  -e ASM3_DBALIAS="$(ALIAS)" \
	  -e ASM3_TARGET_DBNAME="$(or $(DBNAME),asm3)" \
	  asm3 python3 /app/customizations/src/animaltracker_cli.py

# Sync Animal Tracker "View Records" list into a local table:
# - MICRO_TABLE=micro (destination table name)
# - DRY=1 to fetch/parse only (no DB writes)
# - DEBUG=1 for verbose HTTP debug logging
# - ALLOW_EMPTY=1 to allow truncating to empty set
# - SORTBY="microchipno ASC"
animaltracker-records:
	@echo "Running Animal Tracker records sync..."; \
	echo "Options: MICRO_TABLE=micro DRY=1 DEBUG=1 ALLOW_EMPTY=0 SORTBY=\"microchipno ASC\" DBNAME=asm3 ALIAS=\"...\""; \
	docker-compose exec \
	  -e ANIMALTRACKER_MICRO_TABLE="$(or $(MICRO_TABLE),micro)" \
	  -e ANIMALTRACKER_RECORDS_ALLOW_EMPTY="$(ALLOW_EMPTY)" \
	  -e ANIMALTRACKER_RECORDS_SORTBY="$(or $(SORTBY),microchipno ASC)" \
	  -e ANIMALTRACKER_DRY_RUN="$(DRY)" \
	  -e ANIMALTRACKER_DEBUG="$(DEBUG)" \
	  -e ASM3_DBALIAS="$(ALIAS)" \
	  -e ASM3_TARGET_DBNAME="$(or $(DBNAME),asm3)" \
	  asm3 python3 /app/customizations/src/animaltracker_records_cli.py

# Generate test data
testdata:
	@if [ -z "$(filter-out testdata,$(MAKECMDGOALS))" ]; then \
		echo "Usage: make testdata TYPE COUNT"; \
		echo "Types: animals, people"; \
		echo "Examples:"; \
		echo "  make testdata animals 100"; \
		echo "  make testdata people 50"; \
		exit 1; \
	fi; \
	TYPE=$(word 2,$(MAKECMDGOALS)); \
	COUNT=$(word 3,$(MAKECMDGOALS)); \
	if [ -z "$$TYPE" ] || [ -z "$$COUNT" ]; then \
		echo "Error: Please specify both type and count"; \
		echo "Usage: make testdata TYPE COUNT"; \
		echo "Types: animals, people"; \
		exit 1; \
	fi; \
	if [ "$$TYPE" = "animals" ] || [ "$$TYPE" = "people" ]; then \
		echo "Generating $$COUNT test $$TYPE..."; \
		docker-compose exec asm3 python3 /app/customizations/src/generate_test_data.py $$TYPE $$COUNT; \
	else \
		echo "Error: Invalid type '$$TYPE'"; \
		echo "Supported types: animals, people"; \
		exit 1; \
	fi

# Ignore the extra arguments as targets
%:
	@:

# ============================================================================
# ORIGINAL ASM3 COMMANDS (Prefixed with o_)
# ============================================================================

o_all:	o_clean o_compile o_tags o_rollup o_schema

o_dist:	o_clean o_version o_rollup o_schema
	rm -rf build
	mkdir build
	tar --exclude __pycache__ -czvf build/sheltermanager3-`cat VERSION`-src.tar.gz LICENSE src README.md scripts/asm3.conf.example scripts/wsgi
	cd install/deb && ./makedeb.sh && mv *.deb ../../build

o_distwin32: o_dist
	cd install/win32 && ./make.sh && mv sheltermanager*exe ../../build/sheltermanager3-`cat ../../VERSION`-win32.exe

o_tags:
	@echo "[tags] ============================"
	rm -f tag
	ctags -f tags src/*.py src/asm3/*.py src/asm3/dbms/*.py src/asm3/paymentprocessor/*.py src/asm3/publishers/*.py

o_cscope:
	@echo "[cscope] ==========================="
	find . -name '*.py' > cscope.files
	find . -name '*.psp' >> cscope.files
	cscope -b -q -k

o_clean:
	@echo "[clean] ============================"
	rm -f cscope*
	rm -f tags
	rm -f src/*.pyc
	rm -rf src/__pycache__
	rm -f src/asm3/*.pyc
	rm -rf src/asm3/__pycache__
	rm -f src/asm3/dbms/*.pyc
	rm -rf src/asm3/dbms/__pycache__
	rm -f src/asm3/locales/*.pyc
	rm -rf src/asm3/locales/__pycache__
	rm -f src/asm3/paymentprocessor/*.pyc
	rm -rf src/asm3/paymentprocessor/__pycache__
	rm -f src/asm3/pbkdf2/*.pyc
	rm -rf src/asm3/pbkdf2/__pycache__
	rm -f src/asm3/publishers/*.pyc
	rm -rf src/asm3/publishers/__pycache__
	rm -f scripts/schema/schema.db
	rm -f scripts/unittestdb/base.db
	rm -f scripts/unittestdb/test.db

o_changelog.txt: 
	@echo "[changelog.txt] =============================="
	cat VERSION > src/static/pages/changelog.txt
	echo "======" >> src/static/pages/changelog.txt
	echo >> src/static/pages/changelog.txt
	#git log --no-merges --date=short --oneline --pretty=format:'%C(auto)%h%d %cd [%cn] %s' `cat VERSION_PREVTAG`..HEAD >> src/static/pages/changelog.txt
	git log --no-merges --date=short --oneline --pretty=format:'%cd %s [%an] %C(auto)%h%d' `cat VERSION_PREVTAG`..HEAD >> src/static/pages/changelog.txt

o_changelog: o_changelog.txt
	less src/static/pages/changelog.txt

o_version: o_changelog.txt
	# Include me in any release target to stamp the 
	# build date
	@echo "[version] =========================="
	echo "#!/usr/bin/env python3" > src/asm3/__version__.py
	echo "VERSION = \"`cat VERSION` [`date`]\"" >> src/asm3/__version__.py
	echo "BUILD = \"`date +%m%d%H%M%S`\"" >> src/asm3/__version__.py

o_compat:
	# Generate older browser compatible versions of the js files
	@echo "[compat] =============================="
	mkdir -p src/static/js/compat
	rm -f src/static/js/compat/*.js
	npm --silent run babel

o_rollup: o_compat
	# Generate a rollup file of all javascript files
	@echo "[rollup] ============================="
	mkdir -p src/static/js/bundle
	# minify the regenerator-runtime
	npm --silent run minify_regenrt
	scripts/rollup/rollup.py > src/static/js/bundle/rollup.js
	scripts/rollup/rollup_compat.py > src/static/js/bundle/rollup_compat.js
	# minify them and remove originals
	npm --silent run minify
	npm --silent run minify_compat
	rm -f src/static/js/bundle/rollup.js src/static/js/bundle/rollup_compat.js

o_schema: scripts/schema/schema.db o_version
	# Generate a JSON schema of the database for use when editing
	# SQL within the program
	@echo "[schema] ============================="
	mkdir -p src/static/js/bundle
	scripts/schema/schema.py > src/static/js/bundle/schema.js

scripts/schema/schema.db:
	# Updates the schema.db sqlite database used for building the schema.js file.
	@echo "[schema.db] =========================="
	scripts/schema/make_db.py

o_compile: o_compilejs o_compilepy 

o_compilejs:
	@echo "[compile javascript] ================="
	npm --silent run jshint

o_compilepy: o_version
	@echo "[compile python] ====================="
	flake8 --config=scripts/flake8 src/*.py src/asm3/*.py src/asm3/dbms/*.py src/asm3/publishers/*.py src/asm3/paymentprocessor/*.py

o_pot:
	@echo "[template] ========================="
	po/extract_strings.py > po/asm.pot

o_translation:
	@echo "[translation] ======================"
	cd po && ./po_to_python_js.py
	mv po/locale*py src/asm3/locales
	mv po/locale*js src/static/js/locales

o_icons:
	@echo "[icons] ==========================="
	cd src/static/images/icons && ./z_makecss.sh
	mv src/static/images/icons/asm-icon.css src/static/css

o_manual:
	@echo "[manual] =========================="
	cd doc/manual && $(MAKE) clean html latexpdf
	cp -rf doc/manual/_build/html/* src/static/pages/manual/
	scp -C doc/manual/_build/latex/asm3.pdf root@wwwdx.sheltermanager.com:/var/www/sheltermanager.com/repo/asm3_help.pdf
	rsync -a doc/manual/_build/html/ root@wwwdx.sheltermanager.com:/var/www/sheltermanager.com/repo/asm3_help/

o_chipprefixes:
	@echo "[reports] ========================="
	cd chipprefix && ./update_www.sh
	cd chipprefix && ./update_prefixes_all_db_hosts.sh

o_smcomreports:
	@echo "[smcomreports] ========================="
	cd reports && ./update_www.sh
	cd reports && ./update_reports_all_db_hosts.sh

o_test: o_version
	@echo "[test] ========================="
	cd src && python3 main.py 5000

scripts/unittestdb/base.db:
	# Updates the base.db sqlite database used for running unit tests against. 
	# The suite.py file copies base.db to test.db for speed when re-running tests
	@echo "[unittestdb/base.db] =========================="
	scripts/unittestdb/make_db.py

o_tests: scripts/unittestdb/base.db
	@echo "[tests] ========================"
	cp scripts/unittestdb/base.db scripts/unittestdb/test.db
	cd unittest && python3 suite.py
	rm -f unittest/*.pyc && rm -rf unittest/__pycache__

o_tests_dbupdates: 
	@echo "[tests_dbupdates] =============="
	rm -f scripts/unittestdb/dbupdates.db
	sqlite3 scripts/unittestdb/dbupdates.db < scripts/unittestdb/asm2_postgres.sql
	sqlite3 scripts/unittestdb/dbupdates.db < scripts/unittestdb/asm2_data.sql
	cd src && python3 cron.py maint_db_update_stdout SQLITE host 21 user pass ../scripts/unittestdb/dbupdates.db dbupdates

o_deps:
	@echo "[deps] ========================="
	apt-get install python3 python3-cheroot python3-pil python3-mysqldb python3-psycopg2 python3-webpy
	apt-get install python3-memcache python3-requests python3-reportlab python3-xhtml2pdf python3-lxml
	apt-get install python3-qrcode python3-openpyxl
	apt-get install python3-boto3 python3-stripe
	apt-get install python3-sphinx python3-sphinx-rtd-theme texlive-latex-base texlive-latex-extra latexmk
	apt-get install exuberant-ctags flake8 imagemagick wkhtmltopdf nodejs npm memcached
	npm install
