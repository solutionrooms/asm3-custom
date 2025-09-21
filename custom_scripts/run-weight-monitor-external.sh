#!/bin/bash
set -e

# ASM3 Weight Monitor - External VM Script
# Runs the weight monitor from the host by exec-ing into the asm3 container.

LOG_ROOT="${ASM3_LOG_ROOT:-$(dirname "${BASH_SOURCE[0]}")/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/weight-monitor.log"
LOCK_FILE="/tmp/asm3-weight-monitor.lock"

# Create log directory if it doesn't exist
mkdir -p "$LOG_ROOT"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
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
        log "ERROR: Weight monitor already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale lock file found, removing it"
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"

# Resolve running container by compose service label
ASM3_CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=asm3")
if [ -z "$ASM3_CONTAINER_ID" ]; then
    log "ERROR: ASM3 container is not running"
    exit 1
fi

# Run the weight monitor inside the ASM3 container
log "Running weight monitor via docker exec..."
if docker exec -i "$ASM3_CONTAINER_ID" python3 /app/weight_monitor.py >> "$LOG_FILE" 2>&1; then
    log "Weight monitor completed successfully"
else
    CODE=$?
    log "ERROR: Weight monitor failed with exit code $CODE"
    exit $CODE
fi
