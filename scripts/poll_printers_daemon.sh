#!/bin/bash

# Path to your project and virtual environment
PROJECT_DIR="/home/safeprint/dev/SafePrint"
VENV_DIR="${PROJECT_DIR}/venv"
LOG_FILE="${PROJECT_DIR}/logs/printer_polling.log"
PID_FILE="/tmp/safeprint_printer_polling.pid"

# Create logs directory if it doesn't exist
mkdir -p "$(dirname $LOG_FILE)"

# Function to check if already running
is_running() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0  # Process is running
        fi
    fi
    return 1  # Process is not running
}

# Exit if already running
if is_running; then
    echo "Printer polling daemon already running with PID $(cat $PID_FILE)" >> $LOG_FILE
    exit 0
fi

# Save current PID
echo $$ > "$PID_FILE"

# Cleanup function
cleanup() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): Stopping printer polling daemon" >> $LOG_FILE
    rm -f "$PID_FILE"
    exit 0
}

# Register cleanup function
trap cleanup SIGTERM SIGINT

# Main loop - activate venv and poll continuously with a short gap
cd "$PROJECT_DIR"
echo "$(date '+%Y-%m-%d %H:%M:%S'): Starting printer polling daemon" >> $LOG_FILE

# Run the continuous polling loop
while true; do
    # Limit log file to 5000 lines
    MAX_LINES=5000
    if [ -f "$LOG_FILE" ]; then
        line_count=$(wc -l < "$LOG_FILE")
        if [ "$line_count" -gt "$MAX_LINES" ]; then
            tail -n "$MAX_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
        fi
    fi

    # Activate venv and run the command
    source "$VENV_DIR/bin/activate" && python manage.py poll_printer_snmp >> $LOG_FILE 2>&1

    # Keep the gap short so status changes reach the admin page faster.
    sleep 0.2
done
