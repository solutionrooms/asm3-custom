#!/bin/bash
set -e

# PostgreSQL Database Maintenance - External VM Script
# Runs VACUUM/ANALYZE and compressed backups for every configured database.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_ROOT="${ASM3_LOG_ROOT:-$SCRIPT_DIR/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/db-maintenance.log"
LOCK_FILE="/tmp/asm3-db-maintenance.lock"

# shellcheck source=custom_scripts/_multi_db.sh
. "$SCRIPT_DIR/_multi_db.sh"

mkdir -p "$LOG_ROOT"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup() {
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
    fi
}
trap cleanup EXIT

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

ASM3_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=asm3")
POSTGRES_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=postgres")
if [ -z "$ASM3_CONTAINER_ID" ] || [ -z "$POSTGRES_CONTAINER_ID" ]; then
    log "ERROR: Required containers not running (asm3: ${ASM3_CONTAINER_ID:-missing}, postgres: ${POSTGRES_CONTAINER_ID:-missing})"
    exit 1
fi

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
if [ ! -d "$PROJECT_ROOT" ]; then
    PROJECT_ROOT=""
fi

if [ -z "$PROJECT_ROOT" ] || [ ! -f "$PROJECT_ROOT/.env" ]; then
    MOUNTED_CUSTOM_SCRIPTS=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/custom_scripts"}}{{.Source}}{{end}}{{end}}' "$ASM3_CONTAINER_ID" 2>/dev/null || true)
    if [ -n "$MOUNTED_CUSTOM_SCRIPTS" ]; then
        PROJECT_ROOT=$(dirname "$MOUNTED_CUSTOM_SCRIPTS")
    fi
fi

if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$PROJECT_ROOT/.env"
    set +a
fi

load_database_entries

log "Target databases:"
describe_database_entries | while read -r line; do
    log "  $line"
done

if [ -n "${ASM3_BACKUP_DIR:-}" ]; then
    BACKUP_DIR="$ASM3_BACKUP_DIR"
elif [ -n "$PROJECT_ROOT" ]; then
    BACKUP_DIR="$PROJECT_ROOT/backups"
else
    BACKUP_DIR="/var/backups/asm3"
fi
mkdir -p "$BACKUP_DIR"

OVERALL_STATUS=0

for entry in "${DATABASE_ENTRIES[@]}"; do
    IFS="|" read -r alias dbtype host port username password database <<<"$entry"

    dbtype_upper=$(echo "$dbtype" | tr '[:lower:]' '[:upper:]')
    alias_label="${alias:-default}"
    safe_alias=$(echo "$alias_label" | tr -c '[:alnum:]' '_')
    connect_host="${host:-localhost}"
    if [ "$connect_host" = "postgres" ] || [ -z "$connect_host" ]; then
        connect_host="localhost"
    fi
    connect_port="${port:-5432}"

    log "----------------------------------------"
    log "Processing alias '${alias_label}' (database: ${database}, type: ${dbtype_upper})"

    if [ "$dbtype_upper" != "POSTGRESQL" ]; then
        log "WARNING: Unsupported database type '${dbtype}' for alias '${alias_label}' - skipping"
        OVERALL_STATUS=1
        continue
    fi

    if ! docker exec -i "$POSTGRES_CONTAINER_ID" env \
            PGPASSWORD="$password" \
            PGUSER="$username" \
            PGDATABASE="$database" \
            PGHOST="$connect_host" \
            PGPORT="$connect_port" \
            psql -t -c "SELECT 1;" >/dev/null 2>&1; then
        log "ERROR: Cannot connect to database '${database}' for alias '${alias_label}'"
        OVERALL_STATUS=1
        continue
    fi

    DB_SIZE_BEFORE=$(docker exec -i "$POSTGRES_CONTAINER_ID" env \
        PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
        PGHOST="$connect_host" PGPORT="$connect_port" \
        psql -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" | xargs)
    log "Size before maintenance (${alias_label}): ${DB_SIZE_BEFORE:-unknown}"

    log "Running VACUUM (VERBOSE, ANALYZE) on '${alias_label}'..."
    if docker exec -i "$POSTGRES_CONTAINER_ID" env \
        PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
        PGHOST="$connect_host" PGPORT="$connect_port" \
        psql -c "VACUUM (VERBOSE, ANALYZE);" >> "$LOG_FILE" 2>&1; then
        log "VACUUM completed for '${alias_label}'"
    else
        CODE=$?
        log "ERROR: VACUUM failed for '${alias_label}' (exit $CODE)"
        OVERALL_STATUS=1
        continue
    fi

    DB_SIZE_AFTER=$(docker exec -i "$POSTGRES_CONTAINER_ID" env \
        PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
        PGHOST="$connect_host" PGPORT="$connect_port" \
        psql -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" | xargs)
    log "Size after maintenance (${alias_label}): ${DB_SIZE_AFTER:-unknown}"

    log "Collecting table statistics for '${alias_label}'"
    docker exec -i "$POSTGRES_CONTAINER_ID" env \
        PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
        PGHOST="$connect_host" PGPORT="$connect_port" \
        psql -c "
SELECT 
    schemaname,
    relname AS tablename,
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

    log "Checking table bloat for '${alias_label}'"
    docker exec -i "$POSTGRES_CONTAINER_ID" env \
        PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
        PGHOST="$connect_host" PGPORT="$connect_port" \
        psql -c "
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
LIMIT 5;
" >> "$LOG_FILE" 2>&1

done

log "========================================"
log "Starting backup run (delegated to backup-databases-external.sh)"
log "========================================"
set +e
bash "$SCRIPT_DIR/backup-databases-external.sh" >> "$LOG_FILE" 2>&1
BACKUP_STATUS=$?
set -e
if [ $BACKUP_STATUS -eq 0 ]; then
    log "Backup script completed successfully"
else
    log "ERROR: Backup script failed with exit code $BACKUP_STATUS"
    OVERALL_STATUS=1
fi

log "========================================"
log "Current backup files:"
if compgen -G "$BACKUP_DIR/backup_*.dump" >/dev/null; then
    ls -lh "$BACKUP_DIR"/backup_*.dump | while read -r line; do
        log "  $line"
    done
else
    log "  (no backups found)"
fi

log "========================================"
log "PostgreSQL Database Maintenance & Backup Completed"
log "========================================"

exit $OVERALL_STATUS
