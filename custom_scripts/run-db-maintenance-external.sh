#!/bin/bash
set -e

# PostgreSQL Database Maintenance - External VM Script
# This script runs PostgreSQL VACUUM and ANALYZE operations from outside the container

# Get the directory where this script is located, then go up one level to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/asm3/db-maintenance.log"
LOCK_FILE="/tmp/asm3-db-maintenance.lock"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to cleanup lock file on exit
cleanup() {
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
    fi
}
trap cleanup EXIT

# Check if another instance is already running
if [ -f "$LOCK_FILE" ]; then
    if kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
        log "ERROR: Database maintenance already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale lock file found, removing it"
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

log "========================================"
log "Starting PostgreSQL Database Maintenance"
log "========================================"

# Change to project directory
if [ ! -d "$PROJECT_DIR" ]; then
    log "ERROR: Project directory $PROJECT_DIR not found"
    exit 1
fi

cd "$PROJECT_DIR"

# Check if containers are running
if ! docker-compose ps | grep -q "Up"; then
    log "ERROR: ASM3 containers are not running"
    exit 1
fi

# Check database connectivity first
log "Checking database connectivity..."
if ! docker-compose exec -T postgres psql -U asm3 -d asm3 -c "SELECT version();" >/dev/null 2>&1; then
    log "ERROR: Cannot connect to PostgreSQL database"
    exit 1
fi

# Get database size before maintenance
log "Getting database statistics before maintenance..."
DB_SIZE_BEFORE=$(docker-compose exec -T postgres psql -U asm3 -d asm3 -t -c "SELECT pg_size_pretty(pg_database_size('asm3'));" | xargs)
log "Database size before maintenance: $DB_SIZE_BEFORE"

# Run VACUUM ANALYZE on the database
log "Running VACUUM ANALYZE on asm3 database..."
if docker-compose exec -T postgres psql -U asm3 -d asm3 -c "VACUUM (VERBOSE, ANALYZE);" >> "$LOG_FILE" 2>&1; then
    log "VACUUM ANALYZE completed successfully"
else
    log "ERROR: VACUUM ANALYZE failed with exit code $?"
    exit 1
fi

# Get database size after maintenance
DB_SIZE_AFTER=$(docker-compose exec -T postgres psql -U asm3 -d asm3 -t -c "SELECT pg_size_pretty(pg_database_size('asm3'));" | xargs)
log "Database size after maintenance: $DB_SIZE_AFTER"

# Get table statistics
log "Getting table statistics..."
docker-compose exec -T postgres psql -U asm3 -d asm3 -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE n_dead_tup > 0 OR n_live_tup > 1000
ORDER BY n_dead_tup DESC, n_live_tup DESC 
LIMIT 10;
" >> "$LOG_FILE" 2>&1

# Check for bloated tables (optional - informational)
log "Checking for table bloat..."
docker-compose exec -T postgres psql -U asm3 -d asm3 -c "
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
LIMIT 5;
" >> "$LOG_FILE" 2>&1

# Create database backup after maintenance
log "========================================"
log "Creating Database Backup"
log "========================================"

# Create backup directory if it doesn't exist
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"

# Create backup with timestamp
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${BACKUP_TIMESTAMP}.dump"

log "Creating compressed database backup: $BACKUP_FILE"
if docker-compose exec -T postgres pg_dump -U asm3 -Fc asm3 > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE (Size: $BACKUP_SIZE)"
else
    log "ERROR: Database backup failed with exit code $?"
    # Don't exit here - backup failure shouldn't stop the maintenance process
fi

# Clean up old backups - keep only the last 3
log "Cleaning up old backups (keeping last 3)..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.dump 2>/dev/null | wc -l)
log "Found $BACKUP_COUNT backup files"

if [ "$BACKUP_COUNT" -gt 3 ]; then
    # Remove oldest backups, keeping only the 3 most recent
    ls -1t "$BACKUP_DIR"/backup_*.dump | tail -n +4 | while read old_backup; do
        if [ -f "$old_backup" ]; then
            log "Removing old backup: $old_backup"
            rm -f "$old_backup"
        fi
    done
    REMAINING_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.dump 2>/dev/null | wc -l)
    log "Cleanup complete. $REMAINING_COUNT backup files remaining."
else
    log "No cleanup needed. Backup count ($BACKUP_COUNT) is within limit (3)."
fi

# List current backups
log "Current backup files:"
ls -lh "$BACKUP_DIR"/backup_*.dump 2>/dev/null | while read line; do
    log "  $line"
done

log "========================================"
log "PostgreSQL Database Maintenance & Backup Completed"
log "========================================"