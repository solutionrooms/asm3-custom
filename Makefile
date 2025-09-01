
# ASM3 Docker Management Makefile
# Combined original ASM3 commands (prefixed with o_) and Docker management commands
.PHONY: help build start stop restart logs logs-weight logs-cron logs-db clean cleanup update backup restore backup-table restore-table clear-cache shell version upgrade list-versions init-ssl renew-ssl ssl-status ssl-auto-renew ssl-stop-renew generate-ssl-config install-cron uninstall-cron status-cron testdata run

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
	@echo "  restore       - Restore DB from FILE; or 'make restore TABLE [FILE=...]' to restore one table"
	@echo "  restore-table - Restore a single table (usage: make restore-table TABLE=name [FILE=...])"
	@echo "  clear-cache   - Clear application cache and restart"
	@echo "  shell         - Open shell in ASM3 container"
	@echo "  db-shell      - Open database shell"
	@echo "  run <task>    - Run utility tasks inside containers (see below)"
	@echo "                 Tasks: weightmonitor, daily, db-maintenance, backup"
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

# Start the application
start:
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
	tail -f /var/log/asm3/db-maintenance.log

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
	@sudo truncate -s 0 /var/log/asm3/*.log 2>/dev/null || echo "  No VM log files to clean"
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
	@TABLE=$$(word 2,$$(MAKECMDGOALS)); \
	if [ -n "$$TABLE" ] && [ "$$TABLE" != "backup" ]; then \
		SAFE_TABLE=$$(echo "$$TABLE" | tr -c '[:alnum:]_\n\r' '_'); \
		BACKUP_FILE="backup_table_$$(echo $$SAFE_TABLE)_$$(date +%Y%m%d_%H%M%S).dump"; \
		echo "Creating compressed backup for table: $$TABLE -> $$BACKUP_FILE"; \
		docker-compose exec -T postgres pg_dump -U asm3 -Fc -t "public.$$TABLE" asm3 > "$$BACKUP_FILE"; \
		echo "Table backup created: $$BACKUP_FILE"; \
	else \
		echo "Creating compressed database backup..."; \
		backup_file="backup_$$(date +%Y%m%d_%H%M%S).dump"; \
		docker-compose exec -T postgres pg_dump -U asm3 -Fc asm3 > "$$backup_file"; \
		echo "Backup created: $$backup_file"; \
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

# Restore database or a single table from backup file
restore:
	@TABLE=$$(word 2,$$(MAKECMDGOALS)); \
	if [ -n "$$TABLE" ] && [ "$$TABLE" != "restore" ]; then \
		SAFE_TABLE=$$(echo "$$TABLE" | tr -c '[:alnum:]_\n\r' '_'); \
		FILE_IN="$(FILE)"; \
		if [ -z "$$FILE_IN" ]; then \
			# Try to find the latest matching table backup
			FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.dump 2>/dev/null | head -1); \
			if [ -z "$$FILE_IN" ]; then \
				FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.sql 2>/dev/null | head -1); \
			fi; \
		fi; \
		if [ -z "$$FILE_IN" ]; then \
			echo "Usage: make restore $$TABLE [FILE=path_to_table_backup.(dump|sql)]"; \
			echo "  No FILE provided and no matching backup_table_$${SAFE_TABLE}_*.dump found."; \
			exit 1; \
		fi; \
		if [ ! -f "$$FILE_IN" ]; then \
			echo "Error: Backup file '$$FILE_IN' not found"; \
			exit 1; \
		fi; \
		echo "WARNING: This will drop and recreate table 'public.$$TABLE' in database 'asm3'."; \
		read -p "Are you sure you want to restore table $$TABLE from '$$FILE_IN'? [y/N] " confirm; \
		if [ "$$confirm" = "y" ]; then \
			if echo "$$FILE_IN" | grep -q "\.dump$$"; then \
				cat "$$FILE_IN" | docker-compose exec -T postgres pg_restore -U asm3 -d asm3 --clean --if-exists -t "public.$$TABLE"; \
			else \
				cat "$$FILE_IN" | docker-compose exec -T postgres psql -U asm3 -d asm3; \
			fi; \
			echo "Table restore complete!"; \
		else \
			echo "Table restore cancelled."; \
		fi; \
	else \
		if [ -z "$(FILE)" ]; then \
			echo "Usage: make restore FILE=backup_file.dump [SOURCE_DB=source_db_name]"; \
			echo "  FILE: Path to backup file"; \
			echo "  SOURCE_DB: Original database name (if different from 'asm3')"; \
			echo "Available backup files:"; \
			ls -la backup_*.dump backup_*.sql 2>/dev/null || echo "No backup files found"; \
			exit 1; \
		fi; \
		if [ ! -f "$(FILE)" ]; then \
			echo "Error: Backup file $(FILE) not found"; \
			exit 1; \
		fi; \
		SOURCE_DB_NAME=$${SOURCE_DB:-asm3}; \
		echo "WARNING: This will overwrite the current database!"; \
		echo "Source database: $$SOURCE_DB_NAME -> Target database: asm3"; \
		read -p "Are you sure you want to restore from $(FILE)? [y/N] " confirm; \
		if [ "$$confirm" = "y" ]; then \
			echo "Stopping ASM3 application..."; \
			docker-compose stop asm3; \
			echo "Dropping existing database..."; \
			if ! docker-compose exec -T postgres psql -U asm3 -d postgres -c "DROP DATABASE IF EXISTS asm3;"; then \
				echo "ERROR: Failed to drop database. Check for active connections (e.g., pgAdmin)."; \
				docker-compose start asm3; \
				exit 1; \
			fi; \
			echo "Creating new database..."; \
			if ! docker-compose exec -T postgres psql -U asm3 -d postgres -c "CREATE DATABASE asm3;"; then \
				echo "ERROR: Failed to create database."; \
				docker-compose start asm3; \
				exit 1; \
			fi; \
			echo "Restoring from backup..."; \
			if echo "$(FILE)" | grep -q "\.dump$$"; then \
				if [ "$$SOURCE_DB_NAME" != "asm3" ]; then \
					echo "Note: Restoring from database '$$SOURCE_DB_NAME' to 'asm3'"; \
				fi; \
				cat "$(FILE)" | docker-compose exec -T postgres pg_restore -U asm3 -d asm3 --clean --if-exists; \
			else \
				cat "$(FILE)" | docker-compose exec -T postgres psql -U asm3 -d asm3; \
			fi; \
			echo "Starting ASM3 application..."; \
			docker-compose start asm3; \
			echo "Restore complete!"; \
		else \
			echo "Restore cancelled."; \
		fi; \
	fi

# Explicit: restore a single table (same as `make restore TABLE [FILE=...]`)
restore-table:
	@if [ -z "$(TABLE)" ]; then \
		echo "Usage: make restore-table TABLE=name [FILE=path_to_table_backup.(dump|sql)]"; \
		exit 1; \
	fi; \
	SAFE_TABLE=$$(echo "$(TABLE)" | tr -c '[:alnum:]_\n\r' '_'); \
	FILE_IN="$(FILE)"; \
	if [ -z "$$FILE_IN" ]; then \
		FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.dump 2>/dev/null | head -1); \
		if [ -z "$$FILE_IN" ]; then \
			FILE_IN=$$(ls -1t backup_table_$${SAFE_TABLE}_*.sql 2>/dev/null | head -1); \
		fi; \
	fi; \
	if [ -z "$$FILE_IN" ]; then \
		echo "Error: No matching backup found for table '$(TABLE)' and no FILE provided."; \
		echo "  Expected pattern: backup_table_$${SAFE_TABLE}_*.dump (.sql supported too)"; \
		exit 1; \
	fi; \
	if [ ! -f "$$FILE_IN" ]; then \
		echo "Error: Backup file '$$FILE_IN' not found"; \
		exit 1; \
	fi; \
	echo "WARNING: This will drop and recreate table 'public.$(TABLE)' in database 'asm3'."; \
	read -p "Are you sure you want to restore table $(TABLE) from '$$FILE_IN'? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
		if echo "$$FILE_IN" | grep -q "\.dump$$"; then \
			cat "$$FILE_IN" | docker-compose exec -T postgres pg_restore -U asm3 -d asm3 --clean --if-exists -t "public.$(TABLE)"; \
		else \
			cat "$$FILE_IN" | docker-compose exec -T postgres psql -U asm3 -d asm3; \
		fi; \
	echo "Table restore complete!"; \
	else \
		echo "Table restore cancelled."; \
	fi

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
	@sudo mkdir -p /var/log/asm3
	@echo "Installing cron jobs..."
	@(crontab -l 2>/dev/null; echo "# ASM3 Daily Tasks - Runs at 2:00 AM every day"; echo "0 2 * * * /usr/local/bin/asm3-daily-tasks"; echo "# ASM3 Weight Monitor - Runs every minute"; echo "* * * * * /usr/local/bin/asm3-weight-monitor"; echo "# ASM3 Database Maintenance - Runs at 3:00 AM every day"; echo "0 3 * * * /usr/local/bin/asm3-db-maintenance"; echo "# ASM3 System Monitoring - Runs every 5 minutes"; echo "*/5 * * * * /usr/local/bin/asm3-monitor-system"; echo "# ASM3 Log Cleanup - Runs daily at 1:00 AM"; echo "0 1 * * * /usr/local/bin/asm3-cleanup-logs") | crontab -
	@echo "Cron jobs installed successfully!"
	@echo "Use 'make status-cron' to check status"

# Remove cron jobs from VM host
uninstall-cron:
	@echo "Removing ASM3 cron jobs from VM host..."
	@crontab -l 2>/dev/null | grep -v "asm3-daily-tasks\|asm3-weight-monitor\|asm3-db-maintenance\|asm3-monitor-system\|asm3-cleanup-logs" | crontab - || true
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
	@tail -20 /var/log/asm3/daily-tasks.log 2>/dev/null || echo "No daily tasks log found"
	@echo ""
	@echo "========================================"
	@echo "Recent Weight Monitor Log (last 20 lines):"
	@echo "========================================"
	@tail -20 /var/log/asm3/weight-monitor.log 2>/dev/null || echo "No weight monitor log found"
	@echo ""
	@echo "========================================"
	@echo "Recent Database Maintenance Log (last 20 lines):"
	@echo "========================================"
	@tail -20 /var/log/asm3/db-maintenance.log 2>/dev/null || echo "No database maintenance log found"

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
	@tail -10 /var/log/asm3/system-metrics-$(date +%Y-%m-%d).log 2>/dev/null || echo "No metrics for today"
	@echo ""
	@echo "Recent System Events:"
	@echo "====================="
	@tail -10 /var/log/asm3/system-events-$(date +%Y-%m-%d).log 2>/dev/null || echo "No events for today"

# Run helper dispatcher
run:
	@if [ -z "$(filter-out run,$(MAKECMDGOALS))" ]; then \
		echo "Usage: make run <task>"; \
		echo "Tasks:"; \
		echo "  weightmonitor   - Run weight monitor now"; \
		echo "  daily           - Run all daily tasks now"; \
		echo "  db-maintenance  - Run VACUUM (VERBOSE, ANALYZE)"; \
		echo "  backup          - Create database backup"; \
		exit 1; \
	fi; \
	TASK=$(word 2,$(MAKECMDGOALS)); \
	if [ "$$TASK" = "weightmonitor" ]; then \
		echo "Running weight monitor..."; \
		docker-compose exec asm3 python3 /app/weight_monitor.py; \
	elif [ "$$TASK" = "daily" ]; then \
		echo "Running daily tasks..."; \
		docker-compose exec asm3 python3 /app/src/cron.py all; \
	elif [ "$$TASK" = "db-maintenance" ]; then \
		echo "Running database VACUUM (VERBOSE, ANALYZE)..."; \
		docker-compose exec postgres psql -U asm3 -d asm3 -c "VACUUM (VERBOSE, ANALYZE);"; \
	elif [ "$$TASK" = "backup" ]; then \
		$(MAKE) backup; \
	else \
		echo "Error: Unknown task '$$TASK'"; \
		echo "Supported: weightmonitor, daily, db-maintenance, backup"; \
		exit 1; \
	fi

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
