#!/usr/bin/env bash
LOCAL_ENDPOINT=${1:-"ws://192.168.1.207:4444"}
CLOUD_ENDPOINT=${2:-"wss://your-railway-app.railway.app"}

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
  --content "Active. Monitoring application sensor usage (Android 10)..." \
  --button1 "STOP AGENT" \
  --button1-action "/data/data/com.termux/files/usr/bin/bash /data/data/com.termux/files/home/hybrid-agent/stop_agent.sh" \
  --priority high \
  --ongoing

nohup node sensor_agent.js "$LOCAL_ENDPOINT" "$CLOUD_ENDPOINT" > agent.log 2>&1 &
echo $! > "$PID_FILE"
