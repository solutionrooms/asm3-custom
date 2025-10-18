#!/bin/bash
set -e

# Standalone backup utility that dumps every configured ASM3 database.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_ROOT="${ASM3_LOG_ROOT:-$SCRIPT_DIR/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/db-backup.log"
LOCK_FILE="/tmp/asm3-db-backup.lock"

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
        log "ERROR: Database backup already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale backup lock detected, removing it"
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"

log "========================================"
log "Starting ASM3 Database Backup"
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

log "Databases to backup:"
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

RUN_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
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
    log "Backing up alias '${alias_label}' (database: ${database}, type: ${dbtype_upper})"

    if [ "$dbtype_upper" != "POSTGRESQL" ]; then
        log "WARNING: Unsupported database type '${dbtype}' for alias '${alias_label}' - skipping"
        OVERALL_STATUS=1
        continue
    fi

    if ! docker exec -i "$POSTGRES_CONTAINER_ID" env \
            PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
            PGHOST="$connect_host" PGPORT="$connect_port" \
            psql -t -c "SELECT 1;" >/dev/null 2>&1; then
        log "ERROR: Unable to connect to database '${database}' for alias '${alias_label}'"
        OVERALL_STATUS=1
        continue
    fi

    BACKUP_FILE="$BACKUP_DIR/backup_${safe_alias}_${RUN_TIMESTAMP}.dump"
    log "Creating compressed backup: $BACKUP_FILE"
    if docker exec -i "$POSTGRES_CONTAINER_ID" env \
            PGPASSWORD="$password" PGUSER="$username" PGDATABASE="$database" \
            PGHOST="$connect_host" PGPORT="$connect_port" \
            pg_dump -Fc > "$BACKUP_FILE"; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup complete for '${alias_label}': $BACKUP_FILE (Size: $BACKUP_SIZE)"

        if is_truthy "${BACKUP_S3_ENABLED:-}"; then
            S3_BUCKET="${BACKUP_S3_BUCKET:-}"
            S3_PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
            if [ -z "$S3_BUCKET" ]; then
                log "ERROR: BACKUP_S3_ENABLED is true but BACKUP_S3_BUCKET is not set"
            else
                if [ -n "$S3_PREFIX" ]; then
                    S3_KEY="${S3_PREFIX}/${safe_alias}/$(basename "$BACKUP_FILE")"
                else
                    S3_KEY="${safe_alias}/$(basename "$BACKUP_FILE")"
                fi
                S3_URI="s3://${S3_BUCKET}/${S3_KEY}"
                log "Uploading '${alias_label}' backup to ${S3_URI}"
                export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
                export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
                export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-}"
                if [ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]; then
                    export AWS_ENDPOINT_URL_S3="${BACKUP_S3_ENDPOINT_URL}"
                else
                    unset AWS_ENDPOINT_URL_S3
                fi
                if command -v aws >/dev/null 2>&1; then
                    if aws s3 cp "$BACKUP_FILE" "$S3_URI" --only-show-errors; then
                        log "S3 upload successful for '${alias_label}'"
                    else
                        log "ERROR: S3 upload failed via local aws cli for '${alias_label}'"
                    fi
                else
                    log "aws CLI not found locally, attempting dockerized aws-cli"
                    if docker run --rm \
                        -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL_S3 \
                        -v "$BACKUP_DIR":/backups \
                        amazon/aws-cli s3 cp "/backups/$(basename "$BACKUP_FILE")" "$S3_URI" --only-show-errors; then
                        log "S3 upload successful (dockerized aws-cli) for '${alias_label}'"
                    else
                        log "ERROR: S3 upload failed via dockerized aws-cli for '${alias_label}'"
                    fi
                fi
            fi
            unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION AWS_ENDPOINT_URL_S3
        else
            log "S3 mirroring disabled for '${alias_label}' (BACKUP_S3_ENABLED not true)"
        fi
    else
        CODE=$?
        log "ERROR: Backup failed for '${alias_label}' (exit $CODE)"
        OVERALL_STATUS=1
        continue
    fi

    log "Pruning old backups for '${alias_label}' (keeping last 5)"
    set +e
    mapfile -t ALIAS_BACKUPS < <(ls -1t "$BACKUP_DIR"/backup_"${safe_alias}"_*.dump 2>/dev/null)
    set -e
    if [ ${#ALIAS_BACKUPS[@]} -gt 5 ]; then
        for old_backup in "${ALIAS_BACKUPS[@]:5}"; do
            if [ -f "$old_backup" ]; then
                log "Removing old backup: $old_backup"
                rm -f "$old_backup"
            fi
        done
    fi
done

log "========================================"
log "Available backups:"
if compgen -G "$BACKUP_DIR/backup_*.dump" >/dev/null; then
    ls -lh "$BACKUP_DIR"/backup_*.dump | while read -r line; do
        log "  $line"
    done
else
    log "  (no backups found)"
fi

log "========================================"
log "ASM3 Database Backup Completed"
log "========================================"

exit $OVERALL_STATUS
