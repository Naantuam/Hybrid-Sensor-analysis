#!/usr/bin/env bash
# =================================================================
# start_agent.sh - Termux Launcher with Notification Switch
# =================================================================

# 1. Grab endpoints from command-line arguments, environment, or fall back to default
LOCAL_ENDPOINT=${1:-"ws://kali.local:4444"}
CLOUD_ENDPOINT=${2:-"wss://hybrid-sensor-analysis-production.up.railway.app"}

PID_FILE="/data/data/com.termux/files/home/hybrid-agent/sensor_agent.pid"

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
  --button1-action "/data/data/com.termux/files/usr/bin/bash /data/data/com.termux/files/home/hybrid-agent/stop_agent.sh" \
  --priority high \
  --ongoing

# 2.5. Wireless Auto-Updater Loop
echo "[*] Auditing server for agent script updates..."
UPDATE_HOST=""
HTTP_LOCAL=$(echo "$LOCAL_ENDPOINT" | sed 's/ws:\/\//http:\/\//' | sed 's/wss:\/\//https:\/\//')
STATUS_LOCAL=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "$HTTP_LOCAL/download/sensor_agent.js" || echo "000")

if [ "$STATUS_LOCAL" -eq 200 ]; then
    UPDATE_HOST="$HTTP_LOCAL"
else
    HTTP_CLOUD=$(echo "$CLOUD_ENDPOINT" | sed 's/ws:\/\//http:\/\//' | sed 's/wss:\/\//https:\/\//')
    STATUS_CLOUD=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "$HTTP_CLOUD/download/sensor_agent.js" || echo "000")
    if [ "$STATUS_CLOUD" -eq 200 ]; then
        UPDATE_HOST="$HTTP_CLOUD"
    fi
fi

if [ -n "$UPDATE_HOST" ]; then
    echo "[+] Update server reached ($UPDATE_HOST). Synchronizing script assets..."
    curl -s -o sensor_agent.js "$UPDATE_HOST/download/sensor_agent.js"
    curl -s -o commands.js "$UPDATE_HOST/download/commands.js"
    curl -s -o stop_agent.sh "$UPDATE_HOST/download/stop_agent.sh"
    chmod +x stop_agent.sh
else
    echo "[-] Update server unreachable. Launching using local cache."
fi

# 3. Launch sensor agent node script in background
echo "[*] Launching Node.js Agent process..."
nohup node sensor_agent.js "$LOCAL_ENDPOINT" "$CLOUD_ENDPOINT" > agent.log 2>&1 &
AGENT_PID=$!

echo "$AGENT_PID" > "$PID_FILE"
echo "[+] Sensor Agent successfully launched in background (PID: $AGENT_PID)."
echo "[*] Standard Output redirected to agent.log"
