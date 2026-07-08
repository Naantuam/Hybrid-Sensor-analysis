#!/usr/bin/env bash
# =================================================================
# start_agent.sh - Termux Launcher with Notification Switch
# =================================================================

# 1. Grab endpoints from command-line arguments, environment, or fall back to default
LOCAL_ENDPOINT=${1:-"ws://kali.local:4444"}
CLOUD_ENDPOINT=${2:-"wss://your-railway-app.railway.app"}

PID_FILE="/tmp/sensor_agent.pid"

# Check if agent is already running
if [ -f "$PID_FILE" ]; then
    RUNNING_PID=$(cat "$PID_FILE")
    if kill -0 "$RUNNING_PID" 2>/dev/null; then
        echo "[!] Sensor agent is already running under PID $RUNNING_PID."
        exit 0
    fi
fi

echo "[*] Initializing Wake-Lock on Android CPU..."
termux-wake-lock

# 2. Spawn notification drawer switch
echo "[*] Creating notification tray toggle switch..."
termux-notification \
  --id "sensor_agent_svc" \
  --title "Hybrid Sensor Monitor" \
  --content "Active. Monitoring application sensor usage..." \
  --button1 "STOP AGENT" \
  --button1-action "bash ~/stop_agent.sh" \
  --priority high \
  --ongoing

# 3. Launch sensor agent node script in background
echo "[*] Launching Node.js Agent process..."
nohup node sensor_agent.js "$LOCAL_ENDPOINT" "$CLOUD_ENDPOINT" > agent.log 2>&1 &
AGENT_PID=$!

echo "$AGENT_PID" > "$PID_FILE"
echo "[+] Sensor Agent successfully launched in background (PID: $AGENT_PID)."
echo "[*] Standard Output redirected to agent.log"
