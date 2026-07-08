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

# 1. Detect connected USB device serial ID
SERIAL=$(adb devices | grep -w "device" | awk '{print $1}' | head -n 1)
if [ -z "$SERIAL" ]; then
    echo "[!] Error: No USB device detected. Please connect device and enable USB Debugging."
    exit 1
fi

# 2. Extract hardware properties
API_LEVEL=$(adb -s "$SERIAL" shell getprop ro.build.version.sdk)
CPU_ABI=$(adb -s "$SERIAL" shell getprop ro.product.cpu.abi)
MODEL=$(adb -s "$SERIAL" shell getprop ro.product.model)
echo "[+] Target Device Identified: ${MODEL} (Serial: ${SERIAL})"
echo "[*] Device CPU Architecture: ${CPU_ABI}"
echo "[*] Device OS API Level   : ${API_LEVEL}"

# 3. Locate correct preconfigured environment archive on Kali host
BACKUP_FILE="backend/agent/termux-backup-${CPU_ABI}-${API_LEVEL}.tar.gz"
if [ ! -f "$BACKUP_FILE" ]; then
    # Fallback to the baseline API 29 compatibility package for this architecture
    BACKUP_FILE="backend/agent/termux-backup-${CPU_ABI}-29.tar.gz"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[!] Error: No matching environment tarball found on server!"
    echo "[!] Expected file at: backend/agent/termux-backup-${CPU_ABI}-29.tar.gz"
    echo "[!] Please run setup once to package a baseline reference for this architecture."
    exit 1
fi

echo "[+] Selected environment snapshot: ${BACKUP_FILE}"

# 4. Push backup package to device temporary directory over USB
echo "[*] Pushing snapshot archive to device public space (/data/local/tmp/)..."
adb -s "$SERIAL" push "$BACKUP_FILE" /data/local/tmp/termux-backup.tar.gz

# 5. Remote launch and extract inside Termux
echo "[*] Opening Termux app on phone..."
adb -s "$SERIAL" shell monkey -p com.termux -c android.intent.category.LAUNCHER 1
sleep 2

echo "[*] Restoring environment files remotely..."
# Send clear screen command
adb -s "$SERIAL" shell input text "clear"
adb -s "$SERIAL" shell input keyevent 66
sleep 0.5

# Send the local unpack and clean command
UNPACK_CMD="tar -zxf /data/local/tmp/termux-backup.tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions && rm /data/local/tmp/termux-backup.tar.gz && exit"
adb -s "$SERIAL" shell input text "$UNPACK_CMD"
adb -s "$SERIAL" shell input keyevent 66

echo "================================================="
echo "[+] Device successfully preconfigured!"
echo "[+] Environment unpacked and temporary files purged."
echo "[*] You can safely unplug the USB connection."
echo "[*] Start the agent on the phone using: cd ~/hybrid-agent && bash start_agent.sh"
echo "================================================="
