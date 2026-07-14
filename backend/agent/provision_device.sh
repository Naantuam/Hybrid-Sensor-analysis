#!/usr/bin/env bash
# =================================================================
# provision_device.sh - Host-Side Automated USB Provisioner
# =================================================================
# Run this script from your Kali Linux host to preconfigure connected
# USB devices instantly without manual typing on the handset.

set -e

# Change directory to the project root relative to the script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."
cd "$PROJECT_ROOT"

echo "================================================="
echo "   Automated USB Environment Provisioner         "
echo "================================================="

# 1. Detect connected USB device serial ID (use $1 parameter if passed, otherwise auto-detect)
SERIAL=${1:-$(adb devices | grep -w "device" | awk '{print $1}' | head -n 1)}
if [ -z "$SERIAL" ]; then
    echo "[!] Error: No USB device detected. Please connect device and enable USB Debugging."
    exit 1
fi

# 2. Extract hardware properties
API_LEVEL=$(adb -s "$SERIAL" shell getprop ro.build.version.sdk | tr -d '\r')
CPU_ABI=$(adb -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')
MODEL=$(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')
ANDROID_VER=$(adb -s "$SERIAL" shell getprop ro.build.version.release | tr -d '\r')

echo "[+] Target Device Identified: ${MODEL} (Serial: ${SERIAL})"
echo "[*] Device CPU Architecture: ${CPU_ABI}"
echo "[*] Device Android Version : ${ANDROID_VER} (API Level ${API_LEVEL})"

# 3. Apply Low-Level OS Permissions and Settings over ADB based on Android Version
echo "[*] Granting system permissions to Termux..."
adb -s "$SERIAL" shell "appops set com.termux SYSTEM_ALERT_WINDOW allow" || true
adb -s "$SERIAL" shell "appops set com.termux.api SYSTEM_ALERT_WINDOW allow" || true
adb -s "$SERIAL" shell "dumpsys deviceidle whitelist +com.termux" || true
adb -s "$SERIAL" shell "dumpsys deviceidle whitelist +com.termux.api" || true

# Version-specific settings: Android 11+ (API 30+) max phantom processes killer disable
if [ "$API_LEVEL" -ge 30 ]; then
    echo "[*] Disabling Android Phantom Process Killer (Android 11+)..."
    adb -s "$SERIAL" shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647" || true
fi

# Version-specific settings: Android 13+ (API 33+) explicit notification permissions
if [ "$API_LEVEL" -ge 33 ]; then
    echo "[*] Granting Post-Notification Permissions (Android 13+)..."
    adb -s "$SERIAL" shell "pm grant com.termux android.permission.POST_NOTIFICATIONS" || true
    adb -s "$SERIAL" shell "pm grant com.termux.api android.permission.POST_NOTIFICATIONS" || true
fi

# 4. Locate correct preconfigured environment archive on Kali host
BACKUP_FILE="backend/agent/termux-backup-${CPU_ABI}.tar.gz"
if [ ! -f "$BACKUP_FILE" ]; then
    # Fallback to the baseline package name if specific CPU not found
    BACKUP_FILE="backend/agent/termux-backup.tar.gz"
fi

# 5. Build dynamic start_agent.sh based on version requirements
LOCAL_IP=$(hostname -I | awk '{print $1}')
PORT=4444
DYNAMIC_START="backend/agent/start_agent_temp.sh"

cat << EOF > "$DYNAMIC_START"
#!/usr/bin/env bash
LOCAL_ENDPOINT=\${1:-"ws://${LOCAL_IP}:${PORT}"}
CLOUD_ENDPOINT=\${2:-"wss://your-railway-app.railway.app"}

PID_FILE="/data/data/com.termux/files/home/hybrid-agent/sensor_agent.pid"

if [ -f "\$PID_FILE" ]; then
    RUNNING_PID=\$(cat "\$PID_FILE")
    if kill -0 "\$RUNNING_PID" 2>/dev/null; then
        echo "[!] Sensor agent is already running under PID \$RUNNING_PID."
        exit 0
    fi
fi

termux-wake-lock
termux-notification \\
  --id "sensor_agent_svc" \\
  --title "Hybrid Sensor Monitor" \\
  --content "Active. Monitoring application sensor usage (Android ${ANDROID_VER})..." \\
  --button1 "STOP AGENT" \\
  --button1-action "/data/data/com.termux/files/usr/bin/bash /data/data/com.termux/files/home/hybrid-agent/stop_agent.sh" \\
  --priority high \\
  --ongoing

nohup node sensor_agent.js "\$LOCAL_ENDPOINT" "\$CLOUD_ENDPOINT" > agent.log 2>&1 &
echo \$! > "\$PID_FILE"
EOF

if [ -f "$BACKUP_FILE" ]; then
    echo "[+] Selected environment snapshot: ${BACKUP_FILE}"
    
    # Push backup package to device temporary directory over USB
    echo "[*] Pushing snapshot archive to device..."
    adb -s "$SERIAL" push "$BACKUP_FILE" /data/local/tmp/termux-backup.tar.gz

    # Remote launch and extract inside Termux
    echo "[*] Opening Termux app..."
    adb -s "$SERIAL" shell monkey -p com.termux -c android.intent.category.LAUNCHER 1
    sleep 2

    echo "[*] Restoring environment files remotely..."
    adb -s "$SERIAL" shell input text "clear"
    adb -s "$SERIAL" shell input keyevent 66
    sleep 0.5

    UNPACK_CMD="tar -zxf /data/local/tmp/termux-backup.tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions && rm /data/local/tmp/termux-backup.tar.gz && exit"
    adb -s "$SERIAL" shell input text "$UNPACK_CMD"
    adb -s "$SERIAL" shell input keyevent 66
    
    # Overwrite the startup script on Termux with the customized version
    sleep 1
    adb -s "$SERIAL" push "$DYNAMIC_START" /data/data/com.termux/files/home/hybrid-agent/start_agent.sh
    adb -s "$SERIAL" shell "chmod +x /data/data/com.termux/files/home/hybrid-agent/*.sh"

    echo "================================================="
    echo "[+] Device successfully preconfigured!"
    echo "[*] Start the agent on the phone using: cd ~/hybrid-agent && bash start_agent.sh"
    echo "================================================="
else
    echo "[-] No preconfigured environment snapshot (.tar.gz) found on server."
    echo "[*] Falling back to loose files deployment via copy.sh..."

    # Push loose agent scripts to device temp directory
    adb -s "$SERIAL" push "backend/agent/commands.js" /data/local/tmp/
    adb -s "$SERIAL" push "backend/agent/sensor_agent.js" /data/local/tmp/
    adb -s "$SERIAL" push "$DYNAMIC_START" /data/local/tmp/start_agent.sh
    adb -s "$SERIAL" push "backend/agent/stop_agent.sh" /data/local/tmp/
    adb -s "$SERIAL" push "backend/agent/copy.sh" /data/local/tmp/

    # Launch Termux
    adb -s "$SERIAL" shell monkey -p com.termux -c android.intent.category.LAUNCHER 1
    sleep 2

    # Trigger copy.sh
    adb -s "$SERIAL" shell input text "clear"
    adb -s "$SERIAL" shell input keyevent 66
    sleep 0.5

    adb -s "$SERIAL" shell input text "bash /data/local/tmp/copy.sh"
    adb -s "$SERIAL" shell input keyevent 66

    echo "================================================="
    echo "[+] Setup successfully completed via loose files fallback!"
    echo "================================================="
fi

rm -f "$DYNAMIC_START"
