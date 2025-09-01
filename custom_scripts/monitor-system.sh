#!/bin/bash
# Lightweight system monitoring for ASM3
# Runs every 5 minutes, minimal overhead

LOG_DIR="/var/log/asm3"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE_ONLY=$(date '+%Y-%m-%d')

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to log with timestamp
log_metric() {
    echo "[$TIMESTAMP] $1" >> "$LOG_DIR/system-metrics-$DATE_ONLY.log"
}

# Function to log errors/events
log_event() {
    echo "[$TIMESTAMP] $1" >> "$LOG_DIR/system-events-$DATE_ONLY.log"
}

# Get system memory info (very lightweight)
MEMORY_INFO=$(free -m | awk 'NR==2{printf "total:%sMB used:%sMB free:%sMB avail:%sMB", $2,$3,$4,$7}')
log_metric "MEMORY $MEMORY_INFO"

# Get container stats (if docker is available)
if command -v docker >/dev/null 2>&1; then
    ASM3_ID=$(docker ps -q -f "label=com.docker.compose.service=asm3")
    PG_ID=$(docker ps -q -f "label=com.docker.compose.service=postgres")
    NGINX_ID=$(docker ps -q -f "label=com.docker.compose.service=nginx")

    if [ -n "$ASM3_ID$PG_ID$NGINX_ID" ]; then
        # Container mem/cpu snapshot
        CONTAINER_STATS=$(docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" 2>/dev/null | grep -E "(asm3|postgres|nginx)" | tr '\n' '|' | sed 's/|$//')
        if [ -n "$CONTAINER_STATS" ]; then
            log_metric "CONTAINERS $CONTAINER_STATS"
        fi

        # Check for container restarts (Restarting/Exited)
        RESTART_COUNT=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(asm3|postgres|nginx)" | grep -cE "Restarting|Exited")
        if [ "$RESTART_COUNT" -gt 0 ]; then
            log_event "ERROR Container restarts detected: $RESTART_COUNT"
        fi

        # Last 5 minutes of logs
        if [ -n "$NGINX_ID" ]; then
            NGINX_ERRORS=$(docker logs --since=5m "$NGINX_ID" 2>/dev/null | grep -cE "error|502|503|504" || echo "0")
            if [ "$NGINX_ERRORS" -gt 0 ]; then
                log_event "WARNING Nginx errors in last 5min: $NGINX_ERRORS"
            fi
        fi

        if [ -n "$ASM3_ID" ]; then
            DB_ERRORS=$(docker logs --since=5m "$ASM3_ID" 2>/dev/null | grep -c -iE "database.*error|connection.*failed|psycopg2.*error" || echo "0")
            if [ "$DB_ERRORS" -gt 0 ]; then
                log_event "ERROR Database connection issues in last 5min: $DB_ERRORS"
            fi

            MEMORY_ERRORS=$(docker logs --since=5m "$ASM3_ID" 2>/dev/null | grep -c -iE "out of memory|memoryerror|killed.*signal" || echo "0")
            if [ "$MEMORY_ERRORS" -gt 0 ]; then
                log_event "CRITICAL Memory errors in last 5min: $MEMORY_ERRORS"
            fi
        fi
    else
        log_event "ERROR Containers not running"
    fi
fi

# Get load average (system stress indicator)
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^[ \t]*//')
log_metric "LOAD $LOAD_AVG"

# Get disk usage (prevent disk full issues)
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    log_event "WARNING Disk usage high: ${DISK_USAGE}%"
fi
log_metric "DISK ${DISK_USAGE}%"

# Check for process issues (zombie processes, high memory consumers)
HIGH_MEM_PROCS=$(ps aux --sort=-%mem | head -6 | tail -5 | awk '{if($4>10) print $11":"$4"%"}' | tr '\n' ',' | sed 's/,$//')
if [ -n "$HIGH_MEM_PROCS" ]; then
    log_metric "HIGH_MEM_PROCS $HIGH_MEM_PROCS"
fi
