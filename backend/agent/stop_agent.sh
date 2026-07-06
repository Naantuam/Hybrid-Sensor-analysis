#!/usr/bin/env bash
# =================================================================
# stop_agent.sh - Termux Shutdown & Cleanup Trigger
# =================================================================

PID_FILE="/tmp/sensor_agent.pid"

echo "[*] Initializing shutdown sequence..."

# 1. Kill Node.js background process
if [ -f "$PID_FILE" ]; then
    AGENT_PID=$(cat "$PID_FILE")
    if kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "[*] Terminating Agent Node process (PID: $AGENT_PID)..."
        kill "$AGENT_PID"
        sleep 1
    fi
    rm -f "$PID_FILE"
else
    # Fallback to kill any general sensor_agent.js processes
    pkill -f "node sensor_agent.js" || true
fi

# 2. Release Termux hardware hooks & sensors
echo "[*] Cleaning up sensor listeners..."
termux-sensor -c || true

# 3. Release Android CPU Wake-Lock
echo "[*] Releasing CPU Wake-Lock..."
termux-wake-unlock || true

# 4. Remove notification drawer switch
echo "[*] Clearing notification tray toggle..."
termux-notification-remove "sensor_agent_svc" || true

echo "[+] Termux Agent has been successfully stopped."
