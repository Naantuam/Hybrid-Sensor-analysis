#!/usr/bin/env bash
LOCAL_ENDPOINT=${1:-"ws://192.168.1.66:4444"}
CLOUD_ENDPOINT=${2:-"wss://hybrid-sensor-analysis-production.up.railway.app"}

PID_FILE="/data/data/com.termux/files/home/hybrid-agent/sensor_agent.pid"

if [ -f "$PID_FILE" ]; then
    RUNNING_PID=$(cat "$PID_FILE")
    if kill -0 "$RUNNING_PID" 2>/dev/null; then
        echo "[!] Sensor agent is already running under PID $RUNNING_PID."
        exit 0
    fi
fi

termux-wake-lock
termux-notification \
  --id "sensor_agent_svc" \
  --title "Hybrid Sensor Monitor" \
  --content "Active. Monitoring application sensor usage (Android )..." \
  --button1 "STOP AGENT" \
  --button1-action "/data/data/com.termux/files/usr/bin/bash /data/data/com.termux/files/home/hybrid-agent/stop_agent.sh" \
  --priority high \
  --ongoing

# Wireless Auto-Updater Loop
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

nohup node sensor_agent.js "$LOCAL_ENDPOINT" "$CLOUD_ENDPOINT" > agent.log 2>&1 &
echo $! > "$PID_FILE"
