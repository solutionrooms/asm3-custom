#!/bin/bash
set -e

# ASM3 Daily Tasks - External VM Script
# This script runs ASM3 daily maintenance tasks from outside the container

PROJECT_DIR="/root/asm3-bhhr"
LOG_FILE="/var/log/asm3/daily-tasks.log"
LOCK_FILE="/tmp/asm3-daily-tasks.lock"

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
        log "ERROR: Daily tasks already running (PID: $(cat "$LOCK_FILE"))"
        exit 1
    else
        log "WARNING: Stale lock file found, removing it"
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

log "========================================"
log "Starting ASM3 Daily Tasks (External)"
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

# Run the daily tasks inside the ASM3 container
log "Running ASM3 daily tasks via docker-compose..."
if docker-compose exec -T asm3 python3 /app/src/cron.py all >> "$LOG_FILE" 2>&1; then
    log "Daily tasks completed successfully"
else
    log "ERROR: Daily tasks failed with exit code $?"
    exit 1
fi

log "========================================"
log "ASM3 Daily Tasks Completed (External)"
log "========================================"