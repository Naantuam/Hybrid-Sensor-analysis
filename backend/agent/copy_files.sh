#!/usr/bin/env bash
# backend/agent/copy_files.sh
# Automates the remote Termux directory copy and execution over USB

set -e

echo "[*] Creating hybrid-agent folder in Termux..."
adb shell input text "mkdir -p /data/data/com.termux/files/home/hybrid-agent"
adb shell input keyevent 66
sleep 0.5

echo "[*] Moving agent files to Termux..."
adb shell input text "cp /data/local/tmp/commands.js /data/local/tmp/sensor_agent.js /data/local/tmp/start_agent.sh /data/local/tmp/stop_agent.sh /data/data/com.termux/files/home/hybrid-agent/"
adb shell input keyevent 66
sleep 0.5

echo "[*] Cleaning up temporary folder..."
adb shell input text "rm /data/local/tmp/commands.js /data/local/tmp/sensor_agent.js /data/local/tmp/start_agent.sh /data/local/tmp/stop_agent.sh"
adb shell input keyevent 66
sleep 0.5

echo "[*] Configuring permissions..."
adb shell input text "chmod +x /data/data/com.termux/files/home/hybrid-agent/*.sh"
adb shell input keyevent 66
sleep 0.5

echo "[*] Launching telemetry agent using absolute Termux path..."
adb shell input text "/data/data/com.termux/files/usr/bin/bash /data/data/com.termux/files/home/hybrid-agent/start_agent.sh"
adb shell input keyevent 66

echo "[+] Execution complete! Check your dashboard."
