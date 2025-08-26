#!/bin/bash
# Log cleanup and rotation for ASM3 monitoring
# Runs daily to prevent disk space issues

LOG_DIR="/var/log/asm3"
DAYS_TO_KEEP=14

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting log cleanup..."

# Compress logs older than 2 days
find "$LOG_DIR" -name "*.log" -mtime +2 ! -name "*.gz" -exec gzip {} \;

# Remove compressed logs older than DAYS_TO_KEEP
find "$LOG_DIR" -name "*.log.gz" -mtime +$DAYS_TO_KEEP -delete

# Remove old metric and event logs (keep raw data for 7 days, summaries longer)
find "$LOG_DIR" -name "system-metrics-*.log" -mtime +7 -delete
find "$LOG_DIR" -name "system-events-*.log" -mtime +7 -delete

# Truncate Docker logs if they get too large (keep last 1000 lines)
if command -v docker >/dev/null 2>&1; then
    # This is safer than clearing all docker logs
    echo "Docker log sizes:"
    docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}"
fi

# Check disk space and warn if low
DISK_USAGE=$(df -h /var/log | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Log disk usage at ${DISK_USAGE}%" >> "$LOG_DIR/system-events-$(date '+%Y-%m-%d').log"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Log cleanup completed. Disk usage: ${DISK_USAGE}%"