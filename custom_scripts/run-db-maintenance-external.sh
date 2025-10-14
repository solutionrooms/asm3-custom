#!/bin/bash
set -e

# PostgreSQL Database Maintenance - External VM Script
# Runs VACUUM/ANALYZE and an optional backup by exec-ing into the postgres container.

LOG_ROOT="${ASM3_LOG_ROOT:-$(dirname "${BASH_SOURCE[0]}")/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/db-maintenance.log"
LOCK_FILE="/tmp/asm3-db-maintenance.lock"

# Create log directory if it doesn't exist
mkdir -p "$LOG_ROOT"

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
if docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "
SELECT 
    schemaname,
    relname AS table_name,
    n_tup_ins AS inserts,
    n_tup_upd AS updates,
    n_tup_del AS deletes,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE n_dead_tup > 0 OR n_live_tup > 1000
ORDER BY n_dead_tup DESC, n_live_tup DESC 
LIMIT 10;
" >> "$LOG_FILE" 2>&1; then
    log "Table statistics captured."
else
    log "WARNING: Failed to fetch table statistics; continuing."
fi

# Check for bloated tables (optional - informational)
log "Checking for table bloat..."
if docker exec -i "$POSTGRES_CONTAINER_ID" psql -U asm3 -d asm3 -c "
SELECT 
    schemaname,
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC 
LIMIT 5;
" >> "$LOG_FILE" 2>&1; then
    log "Table size summary captured."
else
    log "WARNING: Failed to fetch table size summary; continuing."
fi

# Create database backup after maintenance
log "========================================"
log "Creating Database Backup"
log "========================================"

# Load backup-related env from repo .env if discoverable (handles values with spaces)
if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    while IFS= read -r line; do
        line=${line%$'\r'}
        line=${line%%#*}
        line=$(printf '%s' "$line" | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//')
        [ -n "$line" ] || continue
        case "$line" in
            BACKUP_*|ASM3_BACKUP_DIR=*)
                key=${line%%=*}
                value=${line#*=}
                value=$(printf '%s' "$value" | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//')
                if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
                    value=${value#\"}
                    value=${value%\"}
                fi
                export "$key=$value"
                ;;
        esac
    done < "$PROJECT_ROOT/.env"
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

LOCAL_RETENTION_DAYS=${BACKUP_LOCAL_RETENTION_DAYS:-3}
S3_RETENTION_DAYS=${BACKUP_S3_RETENTION_DAYS:-30}
if ! [[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    log "WARNING: BACKUP_LOCAL_RETENTION_DAYS is invalid ('$LOCAL_RETENTION_DAYS'); defaulting to 3"
    LOCAL_RETENTION_DAYS=3
fi
if ! [[ "$S3_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    log "WARNING: BACKUP_S3_RETENTION_DAYS is invalid ('$S3_RETENTION_DAYS'); defaulting to 30"
    S3_RETENTION_DAYS=30
fi

# Create backup with timestamp
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${BACKUP_TIMESTAMP}.dump"

log "Creating compressed database backup: $BACKUP_FILE"
if docker exec -i "$POSTGRES_CONTAINER_ID" pg_dump -U asm3 -Fc asm3 > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE (Size: $BACKUP_SIZE)"
    if [ "$LOCAL_RETENTION_DAYS" -ge 0 ]; then
        log "Pruning local backups older than ${LOCAL_RETENTION_DAYS} days in $BACKUP_DIR"
        LOCAL_REMOVED=0
        while IFS= read -r -d '' old_backup; do
            log "Removing local backup: $old_backup"
            rm -f "$old_backup"
            LOCAL_REMOVED=$((LOCAL_REMOVED + 1))
        done < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'backup_*.dump' -o -name 'backup_*.sql' \) -mtime +"$LOCAL_RETENTION_DAYS" -print0 2>/dev/null)
        if [ "$LOCAL_REMOVED" -eq 0 ]; then
            log "No local backups older than ${LOCAL_RETENTION_DAYS} days found."
        else
            log "Local retention cleanup removed $LOCAL_REMOVED file(s)."
        fi
    fi
    # Optionally mirror backup to S3 if enabled via environment
    if [ "${BACKUP_S3_ENABLED}" = "true" ] || [ "${BACKUP_S3_ENABLED}" = "1" ]; then
        S3_BUCKET="${BACKUP_S3_BUCKET}"
        S3_PREFIX_RAW="${BACKUP_S3_PREFIX:-db-backups}"
        S3_PREFIX_TRIMMED="${S3_PREFIX_RAW#/}"
        S3_PREFIX_TRIMMED="${S3_PREFIX_TRIMMED%/}"
        if [ -n "$S3_PREFIX_TRIMMED" ]; then
            S3_KEY_PREFIX="${S3_PREFIX_TRIMMED}/"
        else
            S3_KEY_PREFIX=""
        fi
        if [ -z "$S3_BUCKET" ]; then
            log "ERROR: BACKUP_S3_ENABLED is true but BACKUP_S3_BUCKET is not set"
        else
            S3_OBJECT_URI="s3://${S3_BUCKET}/${S3_KEY_PREFIX}$(basename "$BACKUP_FILE")"
            log "Uploading backup to ${S3_OBJECT_URI}"
            # Prepare AWS environment vars if provided
            export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
            export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
            export AWS_DEFAULT_REGION="${BACKUP_S3_REGION}"
            if [ -n "${BACKUP_S3_ENDPOINT_URL}" ]; then
                export AWS_ENDPOINT_URL_S3="${BACKUP_S3_ENDPOINT_URL}"
            else
                unset AWS_ENDPOINT_URL_S3
            fi
            AWS_CLI_MODE="docker"
            if command -v aws >/dev/null 2>&1; then
                AWS_CLI_MODE="local"
            fi
            if [ "$AWS_CLI_MODE" = "local" ]; then
                if aws s3 cp "$BACKUP_FILE" "$S3_OBJECT_URI" --only-show-errors; then
                    log "S3 upload successful: $S3_OBJECT_URI"
                else
                    log "ERROR: S3 upload failed via local aws cli"
                fi
            else
                log "aws CLI not found locally, attempting dockerized aws-cli"
                if docker run --rm \
                    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL_S3 \
                    -v "$BACKUP_DIR":/backups \
                    amazon/aws-cli s3 cp "/backups/$(basename "$BACKUP_FILE")" "$S3_OBJECT_URI" --only-show-errors; then
                    log "S3 upload successful (dockerized aws-cli): $S3_OBJECT_URI"
                else
                    log "ERROR: S3 upload failed via dockerized aws-cli"
                fi
            fi
            if [ "$S3_RETENTION_DAYS" -gt 0 ]; then
                log "Enforcing S3 retention: deleting objects older than ${S3_RETENTION_DAYS} days (bucket: ${S3_BUCKET}, prefix: ${S3_KEY_PREFIX:-<root>})"
                RETENTION_CUTOFF=$(date -d "${S3_RETENTION_DAYS} days ago" +%s)
                S3API_ARGS=(s3api list-objects-v2 --bucket "$S3_BUCKET" --output text --query 'Contents[].[LastModified, Key]')
                if [ -n "$S3_KEY_PREFIX" ]; then
                    S3API_ARGS+=(--prefix "$S3_KEY_PREFIX")
                fi
                if [ "$AWS_CLI_MODE" = "local" ]; then
                    S3_LIST_OUTPUT=$(aws "${S3API_ARGS[@]}" 2>/dev/null || true)
                else
                    S3_LIST_OUTPUT=$(docker run --rm \
                        -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL_S3 \
                        amazon/aws-cli "${S3API_ARGS[@]}" 2>/dev/null || true)
                fi
                if [ -z "$S3_LIST_OUTPUT" ] || [[ "$S3_LIST_OUTPUT" == "None" ]]; then
                    log "No S3 backups found for retention pruning."
                else
                    S3_REMOVED=0
                    while IFS=$'\t' read -r last_modified key; do
                        [ -n "$key" ] || continue
                        [ "$key" = "None" ] && continue
                        OBJECT_EPOCH=$(date -d "$last_modified" +%s 2>/dev/null || echo 0)
                        if [ "$OBJECT_EPOCH" -gt 0 ] && [ "$OBJECT_EPOCH" -lt "$RETENTION_CUTOFF" ]; then
                            log "Removing S3 backup older than retention: $key (LastModified: $last_modified)"
                            if [ "$AWS_CLI_MODE" = "local" ]; then
                                aws s3 rm "s3://${S3_BUCKET}/${key}" --only-show-errors || log "WARNING: Failed to delete $key from S3"
                            else
                                docker run --rm \
                                    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL_S3 \
                                    amazon/aws-cli s3 rm "s3://${S3_BUCKET}/${key}" --only-show-errors || log "WARNING: Failed to delete $key from S3 (docker)"
                            fi
                            S3_REMOVED=$((S3_REMOVED + 1))
                        fi
                    done <<< "$S3_LIST_OUTPUT"
                    if [ "$S3_REMOVED" -eq 0 ]; then
                        log "S3 retention cleanup found no backups older than ${S3_RETENTION_DAYS} days."
                    else
                        log "S3 retention cleanup removed $S3_REMOVED object(s)."
                    fi
                fi
            else
                log "S3 retention cleanup disabled (BACKUP_S3_RETENTION_DAYS=${S3_RETENTION_DAYS})."
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

# Summarise backups remaining after retention pass
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.dump 2>/dev/null | wc -l)
log "Local backup files after retention: $BACKUP_COUNT"

# List current backups
log "Current backup files:"
ls -lh "$BACKUP_DIR"/backup_*.dump 2>/dev/null | while read -r line; do
    log "  $line"
done

log "========================================"
log "PostgreSQL Database Maintenance & Backup Completed"
log "========================================"
