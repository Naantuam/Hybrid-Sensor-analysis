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

console.log(`[*] Target Local Endpoint: ${LOCAL_URL}`);
console.log(`[*] Target Cloud Endpoint: ${CLOUD_URL}`);

// Initialize Device ID dynamically
exec('getprop ro.product.model', (err, stdout) => {
    if (!err && stdout.trim()) {
        deviceId = stdout.trim().replace(/\s+/g, '_');
    }
    console.log(`[+] Resolved Device ID: ${deviceId}`);
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
                battery_saver_active: batterySaverActive
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
 * Periodically audits active sensor-using applications (SensorManager & AppOps)
 */
function startTelemetryLoop() {
    if (batterySaverActive) return;
    
    clearInterval(telemetryInterval);
    telemetryInterval = setInterval(async () => {
        try {
            // Run dumpsys, AppOps, and settings queries concurrently
            const [
                sensorRes, micRes, camRes, 
                fineLocRes, coarseLocRes, bleRes, 
                bioRes, accessRes
            ] = await Promise.all([
                execPromise('adb shell dumpsys sensorservice'),
                execPromise('adb shell appops query-op android:record_audio active'),
                execPromise('adb shell appops query-op android:camera active'),
                execPromise('adb shell appops query-op android:fine_location active'),
                execPromise('adb shell appops query-op android:coarse_location active'),
                execPromise('adb shell appops query-op android:bluetooth_scan active'),
                execPromise('adb shell appops query-op android:use_biometric active'),
                execPromise('adb shell settings get secure enabled_accessibility_services')
            ]);

            let activeAppPackages = [];

            // 1. Parse SensorManager physical sensors
            if (!sensorRes.err && sensorRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseSensorServiceOutput(sensorRes.stdout));
            }

            // 2. Parse Microphone recording status
            if (!micRes.err && micRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(micRes.stdout, "Microphone"));
            }

            // 3. Parse Camera status
            if (!camRes.err && camRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(camRes.stdout, "Camera"));
            }

            // 4. Parse Location status (GPS & Network)
            if (!fineLocRes.err && fineLocRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(fineLocRes.stdout, "GPS_Location"));
            }
            if (!coarseLocRes.err && coarseLocRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(coarseLocRes.stdout, "Network_Location"));
            }

            // 5. Parse Bluetooth scanning
            if (!bleRes.err && bleRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(bleRes.stdout, "Bluetooth_Scan"));
            }

            // 6. Parse Biometric use
            if (!bioRes.err && bioRes.stdout) {
                activeAppPackages = activeAppPackages.concat(parseAppOpsOutput(bioRes.stdout, "Biometric_Auth"));
            }

            // 7. Parse enabled Accessibility Services
            let accessibilityPackages = [];
            if (!accessRes.err && accessRes.stdout && accessRes.stdout.trim() !== "null" && accessRes.stdout.trim() !== "") {
                const services = accessRes.stdout.trim().split(':');
                services.forEach(service => {
                    const pkg = service.split('/')[0];
                    if (pkg) accessibilityPackages.push(pkg);
                });
            }

            // Fallback to mock data if ALL queries failed (indicates phone is not paired/connected)
            const allQueriesFailed = sensorRes.err && micRes.err && camRes.err && fineLocRes.err && coarseLocRes.err && bleRes.err && bioRes.err;
            if (allQueriesFailed) {
                activeAppPackages = getMockActiveAppSensorData();
            }

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
 * Generates mock sensor usage events for safety & testing when local ADB pairing is offline
 */
function getMockActiveAppSensorData() {
    const now = Date.now();
    const mockEvents = [];

    // Simulate high frequency sampling (potential side channel)
    if (now % 6 === 0) {
        mockEvents.push({
            package: "com.covert.keylogger.calculator",
            uid: "10199",
            state: "BACKGROUND",
            sensor: "Accelerometer",
            rate: 120, // High rate triggers threat
            screenOff: true,
            foregroundService: false,
            proximityEngaged: false
        });
    }

    // Simulate standard benign camera/microphone usage (e.g. Whatsapp call in foreground)
    if (now % 10 === 0) {
        mockEvents.push({
            package: "com.whatsapp",
            uid: "10084",
            state: "FOREGROUND",
            sensor: "Microphone",
            rate: 1,
            screenOff: false,
            foregroundService: true,
            proximityEngaged: true // Proximity sensor active due to call
        });
    }

    return mockEvents;
}

/**
 * Parses Android AppOps query-op stdout to identify active recorders/cameras
 */
function parseAppOpsOutput(stdout, sensorName) {
    const list = [];
    const lines = stdout.split('\n');
    for (let line of lines) {
        if (line.includes('active=true')) {
            // Match package name: usually prefixing mode/active attributes
            // Examples:
            // "com.whatsapp: mode=ignore; active=true"
            // "Package com.whatsapp: android:record_audio: mode=allow; active=true"
            const match = line.match(/([\w\.]+)(?=:|\s+mode=|\s+active=)/) || line.match(/Package\s+([\w\.]+)/);
            if (match) {
                list.push({
                    package: match[1],
                    uid: "unknown",
                    state: "FOREGROUND", // active indicates it is actively running/recording
                    sensor: sensorName,
                    rate: 1, // unit frequency for events
                    screenOff: false,
                    foregroundService: true,
                    proximityEngaged: false
                });
            }
        }
    }
    return list;
}
