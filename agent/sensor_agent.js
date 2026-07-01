const WebSocket = require('ws');
const { exec } = require('child_process');

// Dynamic configuration parameters (to be fetched or fallback)
const LOCAL_URL = process.argv[2] || "ws://edge-monitor.local:4444";
const CLOUD_URL = process.argv[3] || process.argv[2] || "wss://your-railway-app.railway.app"; // Set by user during railway setup

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

console.log(`[*] Target Local Endpoint: ${LOCAL_URL}`);
console.log(`[*] Target Cloud Endpoint: ${CLOUD_URL}`);

// Initialize Device ID and build attributes dynamically (handles PC adb & local Termux)
function detectDeviceDetails(callback) {
    exec('adb shell getprop ro.product.model', (errModel, stdoutModel) => {
        const isAdb = !errModel && stdoutModel.trim() !== "";
        const propCmd = isAdb ? 'adb shell getprop' : 'getprop';
        
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
                    console.log(`[+] Detected OS: Android ${osVersion} (API Level ${apiLevel}) [Bridge: ${isAdb ? 'USB adb' : 'Local termux'}]`);
                    callback();
                });
            });
        });
    });
}

detectDeviceDetails(() => {
    connectWebSocket();
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
    exec('adb shell dumpsys wifi | grep -i "SSID:" | head -n 1', (err, stdout) => {
        let wifiSsid = "USB_Tethered/Direct";
        if (!err && stdout) {
            const matches = stdout.match(/SSID: "(.*?)"/);
            if (matches && matches[1]) wifiSsid = matches[1];
        }

        const handshake = {
            event_type: "agent_session",
            metadata: {
                timestamp: Date.now()
            },
            payload: {
                device_id: deviceId,
                connection_type: "usb_adb",
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
        exec('termux-battery-status', (err, stdout) => {
            if (err) return;
            try {
                const info = JSON.parse(stdout);
                // Detect battery saver state:
                // Android typically exposes battery saver via settings, but we can also trigger
                // based on percentage <= 15% and not charging as a safety threshold.
                const isBatteryLow = info.percentage <= 15 && info.status !== "CHARGING";
                
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
            } catch (e) {}
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
 * Periodically audits active sensor-using applications (SensorManager, Camera, Audio, Location, Bluetooth)
 */
function startTelemetryLoop() {
    if (batterySaverActive) return;
    
    clearInterval(telemetryInterval);
    telemetryInterval = setInterval(async () => {
        try {
            // Run system dumpsys diagnostics concurrently
            const [
                sensorRes, audioRes, cameraRes, 
                locationRes, bluetoothRes, accessRes
            ] = await Promise.all([
                execPromise('adb shell dumpsys sensorservice'),
                execPromise('adb shell dumpsys audio'),
                execPromise('adb shell dumpsys media.camera'),
                execPromise('adb shell dumpsys location'),
                execPromise('adb shell dumpsys bluetooth_manager'),
                execPromise('adb shell settings get secure enabled_accessibility_services')
            ]);

            let activeAppPackages = [];

            // 1. Parse SensorManager physical sensors
            if (!sensorRes.err && sensorRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseSensorServiceOutput(sensorRes.stdout));
            }

            // 2. Parse Microphone recording status from AudioService activity logs
            if (!audioRes.err && audioRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAudioOutput(audioRes.stdout));
            }

            // 3. Parse Camera status from CameraService active client listings
            if (!cameraRes.err && cameraRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseCameraOutput(cameraRes.stdout));
            }

            // 4. Parse Location status (GPS & Network) from LocationManager records
            if (!locationRes.err && locationRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseLocationOutput(locationRes.stdout));
            }

            // 5. Parse Bluetooth scanning from BLE GATT scanner map
            if (!bluetoothRes.err && bluetoothRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseBluetoothOutput(bluetoothRes.stdout));
            }

            // 6. Parse enabled Accessibility Services
            let accessibilityPackages = [];
            if (!accessRes.err && accessRes.stdout && accessRes.stdout.trim() !== "null" && accessRes.stdout.trim() !== "") {
                const services = accessRes.stdout.trim().split(':');
                services.forEach(service => {
                    const pkg = service.split('/')[0];
                    if (pkg) accessibilityPackages.push(pkg);
                });
            }

            // Fallback to mock data if ALL key diagnostics failed (indicates USB device disconnected)
            const allQueriesFailed = sensorRes.err && audioRes.err && cameraRes.err && locationRes.err && bluetoothRes.err;
            if (allQueriesFailed) {
                activeAppPackages = getMockActiveAppSensorData();
            }

            activeAppPackages.forEach((appEvent) => {
                if (ws && ws.readyState === WebSocket.OPEN && sessionRegistered) {
                    console.log(`[→] Transmitting telemetry: App "${appEvent.package}" using sensor "${appEvent.sensor}" (${appEvent.state})`);
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
                                screen_state: appEvent.screenOff ? "OFF" : "ON",
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

/**
 * Parses dumpsys sensorservice connections log
 */
function parseSensorServiceOutput(stdout) {
    const appsList = [];
    const lines = stdout.split('\n');
    let inConnectionsSection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect start of connections section (case-insensitive for MTK and standard variants)
        if (line.toLowerCase().includes('active connections') || line.toLowerCase().includes('active connection')) {
            inConnectionsSection = true;
            continue;
        }
        
        // Detect section boundaries
        if (line.includes('Previous Registrations') || line.includes('0 direct connections')) {
            inConnectionsSection = false;
        }

        if (inConnectionsSection) {
            // Layout 1: Multi-line MediaTek/Infinix format
            if (line.toLowerCase().startsWith('connection number:')) {
                const packageLine = lines[i + 1] ? lines[i + 1].trim() : '';
                const sensorLine = lines[i + 2] ? lines[i + 2].trim() : '';

                if (packageLine && sensorLine) {
                    const pkgParts = packageLine.split('|');
                    const pkgName = pkgParts[0].trim();
                    const uidMatch = packageLine.match(/uid\s+(\d+)/) || packageLine.match(/uid:?\s*(\d+)/);

                    const sensorParts = sensorLine.split('|');
                    const sensorMatch = sensorParts[0].match(/^([\w\s]+)(?=\s+0x|\s+\d)/) || [null, sensorParts[0].trim()];
                    const sensorName = sensorMatch[1] ? sensorMatch[1].trim() : sensorParts[0].trim();
                    const isActive = sensorLine.toLowerCase().includes('active');

                    if (isActive && pkgName && !pkgName.startsWith('Connection Number')) {
                        appsList.push({
                            package: pkgName,
                            sensor: sensorName,
                            rate: 50,
                            uid: uidMatch ? uidMatch[1] : "unknown",
                            state: packageLine.includes('BACKGROUND') ? 'BACKGROUND' : 'FOREGROUND',
                            screenOff: sensorLine.includes('ScreenOff') || packageLine.includes('ScreenOff'),
                            foregroundService: packageLine.includes('ForegroundService'),
                            proximityEngaged: sensorName.toLowerCase().includes('proximity')
                        });
                    }
                }
                i += 2; // Skip multi-line block
            }
            // Layout 2: Single-line legacy format
            else {
                const pkgMatch = line.match(/([\w\.]+)\s*\|\s*Sensor:\s*([\w\s]+)/);
                if (pkgMatch) {
                    const rateMatch = line.match(/Rate:\s*(\d+)Hz/);
                    const uidMatch = line.match(/UID:\s*(\d+)/);
                    appsList.push({
                        package: pkgMatch[1],
                        sensor: pkgMatch[2].trim(),
                        rate: rateMatch ? parseInt(rateMatch[1]) : 50,
                        uid: uidMatch ? uidMatch[1] : "unknown",
                        state: line.includes('BACKGROUND') ? 'BACKGROUND' : 'FOREGROUND',
                        screenOff: line.includes('ScreenOff'),
                        foregroundService: line.includes('ForegroundService'),
                        proximityEngaged: pkgMatch[2].toLowerCase().includes('proximity')
                    });
                }
            }
        }
    }
    return appsList;
}

/**
 * Parses dumpsys audio logs to track active microphone recording configurations
 */
function parseAudioOutput(stdout) {
    const list = [];
    const lines = stdout.split('\n');
    const activeRecords = new Map();
    
    lines.forEach(line => {
        if (line.includes('rec start')) {
            const riidMatch = line.match(/riid:(\d+)/);
            const pkgMatch = line.match(/pack:([\w\.]+)/);
            const uidMatch = line.match(/uid:(\d+)/);
            if (riidMatch && pkgMatch) {
                activeRecords.set(riidMatch[1], {
                    package: pkgMatch[1],
                    uid: uidMatch ? uidMatch[1] : "unknown"
                });
            }
        } else if (line.includes('rec stop')) {
            const riidMatch = line.match(/riid:(\d+)/);
            if (riidMatch) {
                activeRecords.delete(riidMatch[1]);
            }
        }
    });
    
    activeRecords.forEach((record) => {
        list.push({
            package: record.package,
            uid: record.uid,
            state: "FOREGROUND",
            sensor: "Microphone",
            rate: 1,
            screenOff: false,
            foregroundService: true,
            proximityEngaged: false
        });
    });
    return list;
}

/**
 * Parses dumpsys media.camera active clients lists to check camera lock status
 */
function parseCameraOutput(stdout) {
    const list = [];
    const clientSection = stdout.match(/Active Camera Clients:\s*\n?([^]*?)(?=\n\n|\nAllowed user IDs:|\n==)/i);
    
    if (clientSection && clientSection[1]) {
        const lines = clientSection[1].split('\n');
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed !== '[]' && trimmed !== '') {
                // Match package name, e.g. "Client: com.whatsapp (PID 12345)" or just "com.instagram.android"
                const match = trimmed.match(/Client:\s+([\w\.]+)/) || trimmed.match(/([\w\.]+)/);
                if (match && match[1] !== 'Client' && match[1] !== 'PID') {
                    list.push({
                        package: match[1],
                        uid: "unknown",
                        state: "FOREGROUND",
                        sensor: "Camera",
                        rate: 1,
                        screenOff: false,
                        foregroundService: true,
                        proximityEngaged: false
                    });
                }
            }
        });
    }
    return list;
}

/**
 * Parses dumpsys location records to identify active GPS/Network tracking apps
 */
function parseLocationOutput(stdout) {
    const list = [];
    const lines = stdout.split('\n');
    let inActiveRecords = false;
    let currentProvider = "Location";

    for (let line of lines) {
        if (line.includes('Active Records by Provider:')) {
            inActiveRecords = true;
            continue;
        }
        if (inActiveRecords && (line.includes('Historical Records by Provider:') || line.includes('Last Known Locations:'))) {
            inActiveRecords = false;
        }

        if (inActiveRecords) {
            const providerMatch = line.match(/^(\w+):/);
            if (providerMatch) {
                currentProvider = providerMatch[1];
            }
            
            // Match pattern: UpdateRecord[passive android(1000 foreground) Request[...]]
            const recordMatch = line.match(/UpdateRecord\[\w+\s+([\w\.]+)\((\d+)\s+(\w+)\)/);
            if (recordMatch) {
                const pkgName = recordMatch[1];
                const uid = recordMatch[2];
                const appState = recordMatch[3].toUpperCase();
                
                // Skip system packages
                if (pkgName !== 'android' && pkgName !== 'system') {
                    list.push({
                        package: pkgName,
                        uid: uid,
                        state: appState === 'FOREGROUND' ? 'FOREGROUND' : 'BACKGROUND',
                        sensor: currentProvider === 'gps' ? 'GPS_Location' : 'Network_Location',
                        rate: 1,
                        screenOff: appState === 'BACKGROUND',
                        foregroundService: true,
                        proximityEngaged: false
                    });
                }
            }
        }
    }
    return list;
}

/**
 * Parses dumpsys bluetooth_manager active scans list
 */
function parseBluetoothOutput(stdout) {
    const list = [];
    const lines = stdout.split('\n');
    let inScannerMap = false;

    for (let line of lines) {
        if (line.includes('GATT Scanner Map')) {
            inScannerMap = true;
            continue;
        }
        if (inScannerMap && line.trim() === '') {
            inScannerMap = false;
        }

        if (inScannerMap) {
            const match = line.match(/([\w\.]+)(?=\s+\(|:)/);
            if (match && match[1] !== 'Client' && match[1] !== 'App') {
                list.push({
                    package: match[1],
                    uid: "unknown",
                    state: "FOREGROUND",
                    sensor: "Bluetooth_Scan",
                    rate: 1,
                    screenOff: false,
                    foregroundService: true,
                    proximityEngaged: false
                });
            }
        }
    }
    return list;
}
