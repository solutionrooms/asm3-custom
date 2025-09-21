#!/bin/bash
set -e

# ASM3 Daily Tasks - External VM Script
# Runs ASM3 daily maintenance tasks from the host by exec-ing into the asm3 container.

LOG_ROOT="${ASM3_LOG_ROOT:-$(dirname "${BASH_SOURCE[0]}")/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/daily-tasks.log"
LOCK_FILE="/tmp/asm3-daily-tasks.lock"

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
        log "ERROR: Daily tasks already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale lock file found, removing it"
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"

log "========================================"
log "Starting ASM3 Daily Tasks (External)"
log "========================================"

# Resolve running container by compose service label (robust across project names)
ASM3_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=asm3")
if [ -z "$ASM3_CONTAINER_ID" ]; then
    log "ERROR: ASM3 container is not running"
    exit 1
fi

# Run the daily tasks inside the ASM3 container
log "Running ASM3 daily tasks via docker exec..."
if docker exec -i "$ASM3_CONTAINER_ID" python3 /app/src/cron.py all >> "$LOG_FILE" 2>&1; then
    log "Daily tasks completed successfully"
else
    CODE=$?
    log "ERROR: Daily tasks failed with exit code $CODE"
    exit $CODE
fi

log "========================================"
log "ASM3 Daily Tasks Completed (External)"
log "========================================"
