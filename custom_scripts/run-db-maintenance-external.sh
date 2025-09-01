#!/bin/bash
set -e

# PostgreSQL Database Maintenance - External VM Script
# Runs VACUUM/ANALYZE and an optional backup by exec-ing into the postgres container.

LOG_FILE="/var/log/asm3/db-maintenance.log"
LOCK_FILE="/tmp/asm3-db-maintenance.lock"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Cleanup lock file on exit
cleanup() {
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
    fi
}
trap cleanup EXIT

# Single-instance guard
if [ -f "$LOCK_FILE" ]; then
    if kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
        log "ERROR: Database maintenance already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale lock file found, removing it"
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"

log "========================================"
log "Starting PostgreSQL Database Maintenance"
log "========================================"

# Resolve running containers by compose service label
ASM3_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=asm3")
POSTGRES_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=postgres")
if [ -z "$ASM3_CONTAINER_ID" ] || [ -z "$POSTGRES_CONTAINER_ID" ]; then
    log "ERROR: Required containers not running (asm3: ${ASM3_CONTAINER_ID:-missing}, postgres: ${POSTGRES_CONTAINER_ID:-missing})"
    exit 1
fi

# Try to locate the project root on the host via the asm3 container bind mounts (optional)
PROJECT_ROOT=""
MOUNTED_CUSTOM_SCRIPTS=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/custom_scripts"}}{{.Source}}{{end}}{{end}}' "$ASM3_CONTAINER_ID" 2>/dev/null || true)
if [ -n "$MOUNTED_CUSTOM_SCRIPTS" ]; then
    PROJECT_ROOT=$(dirname "$MOUNTED_CUSTOM_SCRIPTS")
fi

# Check database connectivity first
log "Checking database connectivity..."
if ! docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "SELECT version();" >/dev/null 2>&1; then
    log "ERROR: Cannot connect to PostgreSQL database"
    exit 1
fi

# Get database size before maintenance
log "Getting database statistics before maintenance..."
DB_SIZE_BEFORE=$(docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -t -c "SELECT pg_size_pretty(pg_database_size('asm3'));" | xargs)
log "Database size before maintenance: $DB_SIZE_BEFORE"

# Run VACUUM ANALYZE on the database
log "Running VACUUM (VERBOSE, ANALYZE) on asm3 database..."
if docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "VACUUM (VERBOSE, ANALYZE);" >> "$LOG_FILE" 2>&1; then
    log "VACUUM ANALYZE completed successfully"
else
    CODE=$?
    log "ERROR: VACUUM ANALYZE failed with exit code $CODE"
    exit $CODE
fi

# Get database size after maintenance
DB_SIZE_AFTER=$(docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -t -c "SELECT pg_size_pretty(pg_database_size('asm3'));" | xargs)
log "Database size after maintenance: $DB_SIZE_AFTER"

# Get table statistics
log "Getting table statistics..."
docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "
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
docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "
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

# Load S3 backup env from repo .env if discoverable
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    . "$PROJECT_ROOT/.env"
    set +a
fi

# Backup directory: prefer env var, fall back to repo backups dir (if found), else system path
if [ -n "$ASM3_BACKUP_DIR" ]; then
    BACKUP_DIR="$ASM3_BACKUP_DIR"
elif [ -n "$PROJECT_ROOT" ]; then
    BACKUP_DIR="$PROJECT_ROOT/backups"
else
    BACKUP_DIR="/var/backups/asm3"
fi
mkdir -p "$BACKUP_DIR"

# Create backup with timestamp
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${BACKUP_TIMESTAMP}.dump"

log "Creating compressed database backup: $BACKUP_FILE"
if docker exec -i "$POSTGRES_CONTAINER_ID" pg_dump -U asm3 -Fc asm3 > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE (Size: $BACKUP_SIZE)"
    # Optionally mirror backup to S3 if enabled via environment
    if [ "${BACKUP_S3_ENABLED}" = "true" ] || [ "${BACKUP_S3_ENABLED}" = "1" ]; then
        S3_BUCKET="${BACKUP_S3_BUCKET}"
        S3_PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
        if [ -z "$S3_BUCKET" ]; then
            log "ERROR: BACKUP_S3_ENABLED is true but BACKUP_S3_BUCKET is not set"
        else
            S3_URI="s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$BACKUP_FILE")"
            log "Uploading backup to ${S3_URI}"
            # Prepare AWS environment vars if provided
            export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
            export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
            export AWS_DEFAULT_REGION="${BACKUP_S3_REGION}"
            # For non-AWS S3 endpoints
            if [ -n "${BACKUP_S3_ENDPOINT_URL}" ]; then
                export AWS_ENDPOINT_URL_S3="${BACKUP_S3_ENDPOINT_URL}"
            fi
            # Try local aws cli first, fallback to dockerized aws cli
            if command -v aws >/dev/null 2>&1; then
                if aws s3 cp "$BACKUP_FILE" "$S3_URI" --only-show-errors; then
                    log "S3 upload successful: $S3_URI"
                else
                    log "ERROR: S3 upload failed via local aws cli"
                fi
            else
                log "aws CLI not found locally, attempting dockerized aws-cli"
                if docker run --rm \
                    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL_S3 \
                    -v "$BACKUP_DIR":/backups \
                    amazon/aws-cli s3 cp "/backups/$(basename "$BACKUP_FILE")" "$S3_URI" --only-show-errors; then
                    log "S3 upload successful (dockerized aws-cli): $S3_URI"
                else
                    log "ERROR: S3 upload failed via dockerized aws-cli"
                fi
            fi
        fi
    else
        log "S3 mirroring disabled (BACKUP_S3_ENABLED is not true)"
    fi
else
    CODE=$?
    log "ERROR: Database backup failed with exit code $CODE"
    # Don't exit here - backup failure shouldn't stop the maintenance process
fi

# Clean up old backups - keep only the last 3
log "Cleaning up old backups (keeping last 3)..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.dump 2>/dev/null | wc -l)
log "Found $BACKUP_COUNT backup files"

if [ "$BACKUP_COUNT" -gt 3 ]; then
    # Remove oldest backups, keeping only the 3 most recent
    ls -1t "$BACKUP_DIR"/backup_*.dump | tail -n +4 | while read -r old_backup; do
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
ls -lh "$BACKUP_DIR"/backup_*.dump 2>/dev/null | while read -r line; do
    log "  $line"
done

log "========================================"
log "PostgreSQL Database Maintenance & Backup Completed"
log "========================================"
