#!/usr/bin/env bash
# backend/agent/copy.sh
# Unpacks the agent components inside Termux's user context

echo "[*] Creating hybrid-agent workspace..."
mkdir -p /data/data/com.termux/files/home/hybrid-agent

echo "[*] Unpacking configuration and scripts..."
cp /data/local/tmp/commands.js /data/local/tmp/sensor_agent.js /data/local/tmp/start_agent.sh /data/local/tmp/stop_agent.sh /data/data/com.termux/files/home/hybrid-agent/

echo "[*] Configuring execute permissions..."
chmod +x /data/data/com.termux/files/home/hybrid-agent/*.sh

echo "[*] Purging temporary files..."
rm -f /data/local/tmp/commands.js /data/local/tmp/sensor_agent.js /data/local/tmp/start_agent.sh /data/local/tmp/stop_agent.sh /data/local/tmp/copy.sh

echo "[*] Starting Hybrid Telemetry Agent..."
cd /data/data/com.termux/files/home/hybrid-agent
clear
bash start_agent.sh
