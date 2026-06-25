#!/usr/bin/env bash
# =================================================================
# setup.sh - Interactive Termux Provisioner & Permission Assistant
# =================================================================
set -e

echo "================================================="
echo "   Hybrid Sensor Agent: Interactive Provisioner  "
echo "================================================="
echo "[*] Initializing setup sequence..."

# 1. Update pkg registers and install Node.js + Termux:API tools
echo "[*] Updating package repositories and installing core packages..."
pkg update -y
pkg install nodejs-lts termux-api coreutils -y

# 2. Setup project folder structure
echo "[*] Restructuring workspace..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
mkdir -p ~/hybrid-agent
cp "$SCRIPT_DIR/sensor_agent.js" ~/hybrid-agent/
cp "$SCRIPT_DIR/start_agent.sh" ~/hybrid-agent/
cp "$SCRIPT_DIR/stop_agent.sh" ~/hybrid-agent/
cd ~/hybrid-agent

# 3. Create package.json for dependencies
echo "[*] Generating environment package definitions..."
cat << 'EOF' > package.json
{
  "name": "hybrid-sensor-agent-termux",
  "version": "1.0.0",
  "description": "Preconfigured Termux Telemetry Runtime Agent",
  "main": "sensor_agent.js",
  "dependencies": {
    "ws": "^8.18.0"
  }
}
EOF

# 4. Install NPM modules
echo "[*] Installing required node modules locally..."
npm install --no-audit --no-fund

# 5. Interactive Android Permission Verification
echo ""
echo "================================================="
echo "   STEP 1: Requesting Android Runtime Permissions "
echo "================================================="
echo "[*] Triggering System Notification Dialog..."
echo "[!] Please click 'Allow' on the permission dialog popup."
read -p "Press [Enter] to trigger the prompt..."

# Trigger a test notification to force the Android system dialog popup
termux-notification \
  --id "perm_test" \
  --title "Setup Verification" \
  --content "Checking notification permission status..." \
  --priority low || true

# Wait briefly and clean it up
sleep 2
termux-notification-remove "perm_test" || true
echo "[+] Notification permission prompt completed."

echo ""
echo "================================================="
echo "   STEP 2: Configure Display Over Other Apps"
echo "================================================="
echo "[!] Crucial: This permission allows Termux notification action buttons"
echo "    to execute scripts (like stop_agent.sh) in the background."
echo "[*] We will now open the settings menu automatically."
echo "[*] Please find 'Termux:API', enable 'Allow display over other apps',"
echo "    and then return back to this Termux terminal."
read -p "Press [Enter] to open overlay settings..."

# Open Display Over Other Apps settings page directly
am start -a android.settings.action.MANAGE_OVERLAY_PERMISSION || {
  echo "[!] Failed to open settings page automatically."
  echo "[!] Please manually go to: Settings > Apps > Termux:API > Display over other apps > Allow."
}
read -p "Press [Enter] once overlay permission has been granted..."

echo ""
echo "================================================="
echo "   STEP 3: Configure Battery Optimization"
echo "================================================="
echo "[!] Crucial: Android's power saver will kill background processes"
echo "    if Termux is optimized. We need to disable battery optimization."
echo "[*] We will now open the battery optimization menu."
echo "[*] Change filter to 'All Apps', find 'Termux', set to 'Don't Optimize' (or 'Unrestricted'),"
echo "    and return back to this Termux terminal."
read -p "Press [Enter] to open battery settings..."

# Open Battery Optimization settings page directly
am start -d package:com.termux -a android.settings.request.IGNORE_BATTERY_OPTIMIZATION_SETTINGS || \
am start -a android.settings.ignore_battery_optimization_settings || {
  echo "[!] Failed to open settings page automatically."
  echo "[!] Please manually go to: Settings > Apps > Termux > Battery > set to Unrestricted."
}
read -p "Press [Enter] once battery optimization has been configured..."

# 6. Final Confirmation
echo ""
echo "================================================="
echo "[+] Setup & permissions verification complete!"
echo "[+] Ready for deployment."
echo "[*] Launch the agent using: bash start_agent.sh"
echo "================================================="
