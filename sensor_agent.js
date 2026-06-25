const WebSocket = require('ws');
const { exec } = require('child_process');

// Dynamic configuration parameters (to be fetched or fallback)
const LOCAL_URL = process.argv[2] || "ws://edge-monitor.local:4444";
const CLOUD_URL = process.argv[3] || "wss://your-railway-app.railway.app"; // Set by user during railway setup

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
    exec('dumpsys wifi | grep -i "SSID:" | head -n 1', (err, stdout) => {
        let wifiSsid = "Mobile_Network";
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
                connection_type: wifiSsid === "Mobile_Network" ? "cellular" : "wifi",
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
 * Periodically audits active sensor-using applications
 */
function startTelemetryLoop() {
    if (batterySaverActive) return;
    
    clearInterval(telemetryInterval);
    telemetryInterval = setInterval(() => {
        // Runs dumpsys to find applications listening to sensors
        exec('adb shell dumpsys sensorservice', (err, stdout) => {
            let activeAppPackages = [];

            if (err || !stdout) {
                // Fallback to local simulated/mock sensor app detection if ADB is not paired
                activeAppPackages = getMockActiveAppSensorData();
            } else {
                activeAppPackages = parseSensorServiceOutput(stdout);
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
                                has_foreground_service: appEvent.foregroundService
                            },
                            payload: {
                                proximity_engaged: appEvent.proximityEngaged
                            }
                        }
                    };
                    ws.send(JSON.stringify(telemetryPacket));
                }
            });
        }, 3000);
    });
}

/**
 * Parses dumpsys sensorservice connections log
 */
function parseSensorServiceOutput(stdout) {
    const appsList = [];
    const lines = stdout.split('\n');
    let inConnectionsSection = false;

    for (let line of lines) {
        if (line.includes('Active Connection')) {
            inConnectionsSection = true;
            continue;
        }
        if (inConnectionsSection && line.trim() === '') {
            inConnectionsSection = false;
        }

        if (inConnectionsSection) {
            // Regex matches typical pattern: package_name, active sensor name, sample rates
            // Example line: com.whatsapp | Sensor: Gyroscope | Rate: 100Hz | UID: 10123
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
                    proximityEngaged: line.includes('ProximityNear')
                });
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
