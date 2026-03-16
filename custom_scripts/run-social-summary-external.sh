#!/bin/bash
set -e

# ASM3 Social Media Summary - External VM Script
# Runs the daily social media summary via cron.py inside the ASM3 container.
# Uses the AI provider configured in .env (ASM3_AI_PROVIDER, ASM3_AI_API_KEY, etc.)

LOG_ROOT="${ASM3_LOG_ROOT:-$(dirname "${BASH_SOURCE[0]}")/../logs/asm3}"
LOG_ROOT="$(cd "$LOG_ROOT" 2>/dev/null && pwd || echo "$LOG_ROOT")"
LOG_FILE="${LOG_ROOT}/social-summary.log"
LOCK_FILE="/tmp/asm3-social-summary.lock"

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
        log "ERROR: Social summary already running (PID: $(cat "$LOCK_FILE"))"
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

# Run via cron.py inside the container (uses container's AI config)
log "Running social media summary via docker exec..."
if docker exec -i "$ASM3_CONTAINER_ID" python3 /app/src/cron.py social_media_summary >> "$LOG_FILE" 2>&1; then
    log "Social media summary completed successfully"
else
    CODE=$?
    log "ERROR: Social media summary failed with exit code $CODE"
    exit $CODE
fi
