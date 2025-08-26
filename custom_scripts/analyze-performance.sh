#!/bin/bash
# Performance analysis script for ASM3
# Analyzes collected metrics to identify patterns and issues

LOG_DIR="/var/log/asm3"
ANALYSIS_DIR="$LOG_DIR/analysis"
DATE_RANGE=${1:-7}  # Analyze last N days (default 7)

mkdir -p "$ANALYSIS_DIR"

echo "ASM3 Performance Analysis - Last $DATE_RANGE days"
echo "================================================="
echo ""

# Function to analyze memory trends
analyze_memory() {
    echo "Memory Usage Analysis:"
    echo "----------------------"
    
    # Get memory metrics from recent days
    for i in $(seq 0 $((DATE_RANGE-1))); do
        LOG_DATE=$(date -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -v-"$i"d '+%Y-%m-%d')
        LOG_FILE="$LOG_DIR/system-metrics-$LOG_DATE.log"
        
        if [ -f "$LOG_FILE" ]; then
            echo "Date: $LOG_DATE"
            
            # Extract memory info
            grep "MEMORY" "$LOG_FILE" | tail -1 | sed 's/.*MEMORY /  Latest: /'
            
            # Get min/max memory usage for the day
            USED_VALUES=$(grep "MEMORY" "$LOG_FILE" | sed 's/.*used:\([0-9]*\)MB.*/\1/' | sort -n)
            if [ -n "$USED_VALUES" ]; then
                MIN_MEM=$(echo "$USED_VALUES" | head -1)
                MAX_MEM=$(echo "$USED_VALUES" | tail -1)
                echo "  Range: ${MIN_MEM}MB - ${MAX_MEM}MB"
                
                # Check for memory growth trend
                FIRST_READING=$(echo "$USED_VALUES" | head -1)
                LAST_READING=$(echo "$USED_VALUES" | tail -1)
                GROWTH=$((LAST_READING - FIRST_READING))
                if [ $GROWTH -gt 50 ]; then
                    echo "  ⚠️  Memory growth: +${GROWTH}MB (possible leak)"
                fi
            fi
            
            # Count container restarts
            EVENT_FILE="$LOG_DIR/system-events-$LOG_DATE.log"
            if [ -f "$EVENT_FILE" ]; then
                RESTART_COUNT=$(grep -c "Container restarts" "$EVENT_FILE" 2>/dev/null || echo "0")
                ERROR_COUNT=$(grep -c "ERROR\|CRITICAL" "$EVENT_FILE" 2>/dev/null || echo "0")
                if [ "$RESTART_COUNT" -gt 0 ] || [ "$ERROR_COUNT" -gt 0 ]; then
                    echo "  🔴 Issues: $RESTART_COUNT restarts, $ERROR_COUNT errors"
                fi
            fi
            echo ""
        fi
    done
}

# Function to analyze error patterns
analyze_errors() {
    echo "Error Pattern Analysis:"
    echo "-----------------------"
    
    # Combine recent event logs
    TEMP_EVENTS="/tmp/combined_events.log"
    for i in $(seq 0 $((DATE_RANGE-1))); do
        LOG_DATE=$(date -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -v-"$i"d '+%Y-%m-%d')
        EVENT_FILE="$LOG_DIR/system-events-$LOG_DATE.log"
        [ -f "$EVENT_FILE" ] && cat "$EVENT_FILE" >> "$TEMP_EVENTS"
    done
    
    if [ -f "$TEMP_EVENTS" ]; then
        echo "Error Summary:"
        echo "  Database errors: $(grep -c "Database connection" "$TEMP_EVENTS")"
        echo "  Memory errors: $(grep -c "Memory errors\|out of memory" "$TEMP_EVENTS")"
        echo "  Container restarts: $(grep -c "Container restarts" "$TEMP_EVENTS")"
        echo "  Nginx errors: $(grep -c "Nginx errors" "$TEMP_EVENTS")"
        echo ""
        
        echo "Recent Critical Issues:"
        grep "CRITICAL\|ERROR.*Memory\|Container restarts" "$TEMP_EVENTS" | tail -5 | while read line; do
            echo "  $line"
        done
        echo ""
        
        rm -f "$TEMP_EVENTS"
    else
        echo "  No event logs found"
        echo ""
    fi
}

# Function to analyze container performance
analyze_containers() {
    echo "Container Performance:"
    echo "----------------------"
    
    # Get recent container stats
    RECENT_LOG=$(find "$LOG_DIR" -name "system-metrics-*.log" -mtime -1 | head -1)
    if [ -f "$RECENT_LOG" ]; then
        echo "Latest Container Stats:"
        grep "CONTAINERS" "$RECENT_LOG" | tail -1 | sed 's/.*CONTAINERS //' | tr '|' '\n' | while read container; do
            echo "  $container"
        done
        echo ""
    fi
    
    # Check for high memory processes
    if [ -f "$RECENT_LOG" ]; then
        echo "High Memory Processes:"
        grep "HIGH_MEM_PROCS" "$RECENT_LOG" | tail -1 | sed 's/.*HIGH_MEM_PROCS //' | tr ',' '\n' | while read proc; do
            echo "  $proc"
        done
        echo ""
    fi
}

# Function to generate recommendations
generate_recommendations() {
    echo "Recommendations:"
    echo "----------------"
    
    # Check for memory growth pattern
    MEMORY_ISSUES=0
    for i in $(seq 0 2); do  # Check last 3 days
        LOG_DATE=$(date -d "$i days ago" '+%Y-%m-%d' 2>/dev/null || date -v-"$i"d '+%Y-%m-%d')
        EVENT_FILE="$LOG_DIR/system-events-$LOG_DATE.log"
        if [ -f "$EVENT_FILE" ] && grep -q "Memory errors\|out of memory" "$EVENT_FILE"; then
            MEMORY_ISSUES=$((MEMORY_ISSUES + 1))
        fi
    done
    
    if [ $MEMORY_ISSUES -gt 1 ]; then
        echo "🔴 URGENT: Memory issues detected on multiple days"
        echo "   → Consider upgrading server RAM to 2GB"
        echo "   → Monitor container memory limits"
    fi
    
    # Check restart frequency
    RESTART_ISSUES=$(find "$LOG_DIR" -name "system-events-*.log" -mtime -7 -exec grep -l "Container restarts" {} \; | wc -l)
    if [ $RESTART_ISSUES -gt 2 ]; then
        echo "⚠️  Frequent container restarts detected"
        echo "   → Check application logs for crashes"
        echo "   → Consider container health check tuning"
    fi
    
    # Check disk usage trend
    LATEST_DISK=$(grep "DISK" $(find "$LOG_DIR" -name "system-metrics-*.log" -mtime -1 | head -1) 2>/dev/null | tail -1 | sed 's/.*DISK //' | sed 's/%//')
    if [ -n "$LATEST_DISK" ] && [ "$LATEST_DISK" -gt 70 ]; then
        echo "⚠️  Disk usage high: ${LATEST_DISK}%"
        echo "   → Run log cleanup: ./scripts/cleanup-logs.sh"
        echo "   → Consider disk space monitoring"
    fi
    
    echo ""
    echo "✅ Monitor trends over time to detect gradual degradation"
    echo "✅ Set up alerts if memory usage consistently grows >50MB/day"
}

# Run analysis
analyze_memory
analyze_errors  
analyze_containers
generate_recommendations

# Save summary to file
SUMMARY_FILE="$ANALYSIS_DIR/summary-$(date '+%Y-%m-%d').txt"
{
    echo "ASM3 Performance Summary - $(date)"
    echo "=================================="
    echo ""
    analyze_memory
    analyze_errors
    analyze_containers
    generate_recommendations
} > "$SUMMARY_FILE"

echo "Full analysis saved to: $SUMMARY_FILE"