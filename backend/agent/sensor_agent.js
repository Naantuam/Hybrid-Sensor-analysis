const WebSocket = require('ws');
const { exec } = require('child_process');
const { commands, getSuspiciousAccessibilityServices } = require('./commands');

// Parse CLI arguments & Environment variables
let localUrl = "ws://edge-monitor.local:4444";
let cloudUrl = "wss://your-railway-app.railway.app";
let serial = process.env.ADB_SERIAL || null;

// Parse positional and flag-based arguments
const urls = [];
for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if ((arg === '-s' || arg === '--serial') && i + 1 < process.argv.length) {
        serial = process.argv[i + 1];
        i++;
    } else if (arg.startsWith('ws://') || arg.startsWith('wss://')) {
        urls.push(arg);
    }
}

if (urls.length > 0) {
    localUrl = urls[0];
    cloudUrl = urls[1] || urls[0];
}

const LOCAL_URL = localUrl;
const CLOUD_URL = cloudUrl;

let activeUrl = LOCAL_URL;
let ws = null;
let sessionRegistered = false;
let sessionId = null;
let deviceId = "Android_Device";
let batterySaverActive = false;
let telemetryInterval = null;
let batteryInterval = null;

let apiLevel = 29;
let osVersion = "Unknown";
let isAdbBridge = false;

console.log(`[*] Target Local Endpoint: ${LOCAL_URL}`);
console.log(`[*] Target Cloud Endpoint: ${CLOUD_URL}`);
if (serial) {
    console.log(`[*] Target Device Serial: ${serial}`);
}

// Function to auto-detect a single connected ADB device serial if not provided
function autoDetectAdbSerial(callback) {
    if (serial) {
        return callback();
    }
    exec('adb devices', (err, stdout) => {
        if (!err && stdout) {
            const lines = stdout.split('\n');
            const devices = [];
            for (let line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length === 2 && parts[1] === 'device') {
                    devices.push(parts[0]);
                }
            }
            if (devices.length > 0) {
                // Default to the first detected device
                serial = devices[0];
                console.log(`[*] Auto-detected connected ADB device serial: ${serial}`);
            }
        }
        callback();
    });
}

// Initialize Device ID and build attributes dynamically (handles PC adb & local Termux)
function detectDeviceDetails(callback) {
    const adbPrefix = serial ? `adb -s ${serial} ` : 'adb ';
    exec(`${adbPrefix}shell getprop ro.product.model`, (errModel, stdoutModel) => {
        isAdbBridge = !errModel && stdoutModel.trim() !== "";
        const propCmd = isAdbBridge ? `${adbPrefix}shell getprop` : 'getprop';

        exec(`${propCmd} ro.product.model`, (err, stdout) => {
            if (!err && stdout.trim()) {
                deviceId = stdout.trim().replace(/\s+/g, '_');
            }
            exec(`${propCmd} ro.build.version.sdk`, (errSdk, stdoutSdk) => {
                if (!errSdk && stdoutSdk.trim()) {
                    apiLevel = parseInt(stdoutSdk.trim()) || 29;
                }
                exec(`${propCmd} ro.build.version.release`, (errRel, stdoutRel) => {
                    if (!errRel && stdoutRel.trim()) {
                        osVersion = stdoutRel.trim();
                    }
                    console.log(`[+] Detected OS: Android ${osVersion} (API Level ${apiLevel}) [Bridge: ${isAdbBridge ? 'USB adb' : 'Local termux'}]`);
                    callback();
                });
            });
        });
    });
}

autoDetectAdbSerial(() => {
    detectDeviceDetails(() => {
        connectWebSocket();
    });
});

/**
 * Executes a WebSocket connection with automatic failover and reconnect logic
 */
function connectWebSocket() {
    console.log(`[*] Connecting to server at ${activeUrl}...`);
    ws = new WebSocket(activeUrl);

    ws.on('open', () => {
        console.log(`[+] Connected to broker at ${activeUrl}`);
        sendHandshake();
        startTelemetryLoop();
        startBatteryMonitoring();
    });

    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            if (response.event_type === "session_registered") {
                sessionId = response.session_id;
                sessionRegistered = true;
                console.log(`[+] Session authenticated successfully. Assigned DB Session ID: ${sessionId}`);
            }
        } catch (e) {
            console.log('[!] Error reading broker response:', e.message);
        }
    });

    ws.on('error', (err) => {
        console.log(`[!] Connection error on ${activeUrl}: ${err.message}`);
    });

    ws.on('close', () => {
        console.log(`[-] Disconnected from ${activeUrl}`);
        sessionRegistered = false;
        clearInterval(telemetryInterval);
        clearInterval(batteryInterval);

        // Swap endpoints if failover is needed
        if (activeUrl === LOCAL_URL) {
            console.log(`[*] Swapping to Cloud failover endpoint: ${CLOUD_URL}`);
            activeUrl = CLOUD_URL;
        } else {
            console.log(`[*] Retrying Local endpoint: ${LOCAL_URL}`);
            activeUrl = LOCAL_URL;
        }

        // Reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
    });
}

/**
 * Sends initial handshake registration payload
 */
function sendHandshake() {
    const adbPrefix = serial ? `adb -s ${serial} ` : 'adb ';
    const cmd = isAdbBridge ? `${adbPrefix}shell dumpsys wifi` : 'dumpsys wifi';
    exec(cmd, (err, stdout) => {
        let wifiSsid = "USB_Tethered/Direct";
        if (!err && stdout) {
            const matches = stdout.match(/SSID:\s*"(.*?)"/) || stdout.match(/SSID:\s*([^\s,]+)/);
            if (matches && matches[1]) wifiSsid = matches[1];
        }

        const handshake = {
            event_type: "agent_session",
            metadata: {
                timestamp: Date.now()
            },
            payload: {
                device_id: deviceId,
                connection_type: isAdbBridge ? "usb_adb" : "local_termux",
                ssid: wifiSsid,
                battery_saver_active: batterySaverActive,
                api_level: apiLevel,
                os_version: osVersion
            }
        };
        ws.send(JSON.stringify(handshake));
    });
}

/**
 * Monitors battery status and suspends/resumes tracing based on battery saver settings
 */
function startBatteryMonitoring() {
    batteryInterval = setInterval(() => {
        const cmd = isAdbBridge ? (serial ? `adb -s ${serial} shell dumpsys battery` : 'adb shell dumpsys battery') : 'termux-battery-status';
        exec(cmd, (err, stdout) => {
            if (err) return;
            try {
                let percentage = 100;
                let isCharging = false;

                if (isAdbBridge) {
                    const levelMatch = stdout.match(/level:\s*(\d+)/);
                    const statusMatch = stdout.match(/status:\s*(\d+)/);
                    if (levelMatch) {
                        percentage = parseInt(levelMatch[1]);
                    }
                    if (statusMatch) {
                        isCharging = (parseInt(statusMatch[1]) === 2); // 2 is BATTERY_STATUS_CHARGING
                    }
                } else {
                    const info = JSON.parse(stdout);
                    percentage = info.percentage;
                    isCharging = info.status === "CHARGING";
                }

                const isBatteryLow = percentage <= 15 && !isCharging;

                if (isBatteryLow !== batterySaverActive) {
                    batterySaverActive = isBatteryLow;
                    console.log(`[*] Battery state shifted. Battery Saver Active: ${batterySaverActive}`);

                    // Notify the server of state change
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            event_type: "battery_saver_change",
                            payload: { battery_saver_active: batterySaverActive }
                        }));
                    }

                    if (batterySaverActive) {
                        console.log('[!] Suspending telemetry collection to conserve battery power.');
                        clearInterval(telemetryInterval);
                    } else {
                        console.log('[+] Resuming telemetry collection.');
                        startTelemetryLoop();
                    }
                }
            } catch (e) { }
        });
    }, 10000);
}

/**
 * Executes a child process command and returns a Promise
 */
function execPromise(command) {
    return new Promise((resolve) => {
        exec(command, (err, stdout) => {
            resolve({ err, stdout });
        });
    });
}

/**
 * Runs a command on the device (prefixes with adb shell if in ADB bridge mode)
 */
function runDeviceCmd(command) {
    const adbPrefix = serial ? `adb -s ${serial} ` : 'adb ';
    const prefix = isAdbBridge ? `${adbPrefix}shell ` : '';
    return execPromise(prefix + command);
}

/**
 * Periodically audits active sensor-using applications (SensorManager, Camera, Audio, Location, Bluetooth)
 */
function startTelemetryLoop() {
    if (batterySaverActive) return;

    clearInterval(telemetryInterval);
    telemetryInterval = setInterval(async () => {
        try {
            // Run system dumpsys diagnostics concurrently using definitions in commands.js
            const [
                sensorRes, audioRes, cameraRes,
                locationRes, bluetoothRes, accessRes,
                powerRes
            ] = await Promise.all([
                runDeviceCmd(commands.sensorservice.shellCommand),
                runDeviceCmd(commands.audio.shellCommand),
                runDeviceCmd(commands.camera.shellCommand),
                runDeviceCmd(commands.location.shellCommand),
                runDeviceCmd(commands.bluetooth.shellCommand),
                runDeviceCmd(commands.accessibility.shellCommand),
                runDeviceCmd(commands.power.shellCommand)
            ]);

            let activeAppPackages = [];

            // 1. Parse SensorManager physical sensors
            if (!sensorRes.err && sensorRes.stdout) {
                activeAppPackages = activeAppPackages.concat(commands.sensorservice.parse(sensorRes.stdout));
            }

            // 2. Parse Microphone recording status
            if (!audioRes.err && audioRes.stdout) {
                activeAppPackages = activeAppPackages.concat(commands.audio.parse(audioRes.stdout));
            }

            // 3. Parse Camera status
            if (!cameraRes.err && cameraRes.stdout) {
                activeAppPackages = activeAppPackages.concat(commands.camera.parse(cameraRes.stdout));
            }

            // 4. Parse Location status
            if (!locationRes.err && locationRes.stdout) {
                activeAppPackages = activeAppPackages.concat(commands.location.parse(locationRes.stdout));
            }

            // 5. Parse Bluetooth scanning
            if (!bluetoothRes.err && bluetoothRes.stdout) {
                activeAppPackages = activeAppPackages.concat(commands.bluetooth.parse(bluetoothRes.stdout));
            }

            // 6. Parse enabled Accessibility Services
            let accessibilityPackages = [];
            if (!accessRes.err && accessRes.stdout) {
                accessibilityPackages = commands.accessibility.parse(accessRes.stdout);
            }

            // Fallback if ALL key diagnostics failed (indicates USB device disconnected)
            const allQueriesFailed = sensorRes.err && audioRes.err && cameraRes.err && locationRes.err && bluetoothRes.err;
            if (allQueriesFailed) {
                console.log('[!] Warning: All sensor queries failed. Handset might be disconnected.');
                activeAppPackages = [];
            }

            const isDisplayOn = !powerRes.err ? commands.power.parse(powerRes.stdout) : true;

            activeAppPackages.forEach((appEvent) => {
                if (ws && ws.readyState === WebSocket.OPEN && sessionRegistered) {
                    const telemetryPacket = {
                        event_type: "app_sensor_telemetry",
                        metadata: {
                            timestamp: Date.now()
                        },
                        payload: {
                            app_package: appEvent.package,
                            app_uid: appEvent.uid,
                            app_state: appEvent.state,
                            sensor_name: appEvent.sensor,
                            polling_rate_hz: appEvent.rate,
                            metadata: {
                                screen_state: isDisplayOn ? "ON" : "OFF",
                                has_foreground_service: appEvent.foregroundService,
                                enabled_accessibility_services: accessibilityPackages
                            },
                            payload: {
                                proximity_engaged: appEvent.proximityEngaged
                            }
                        }
                    };
                    ws.send(JSON.stringify(telemetryPacket));
                }
            });
        } catch (e) {
            console.log('[!] Error in telemetry loop:', e.message);
        }
    }, 3000);
}

