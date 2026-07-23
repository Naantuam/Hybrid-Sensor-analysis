const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env if present (local fallback)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = (match[2] || '').trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            process.env[key] = value;
        }
    });
}

const { exec, spawn } = require('child_process');
const { 
    initDatabase, 
    saveSession, 
    updateSessionBatterySaver, 
    saveSensorEvent, 
    saveThreatAlert,
    getSessions,
    getSessionStats,
    getThreatAlerts,
    getSensorEvents,
    getSystemStats,
    getAllThreatAlerts,
    getAllSensorEvents
} = require('./db');
const { evaluatePacket } = require('./rules');

// Alert cooldown cache: suppress duplicate threat alerts for the same app+sensor within 5 minutes
// Key: "package:sensor" -> last alert timestamp (ms)
const alertCooldownMap = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Initialize the Web Server
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Create an HTTP server attached to Express
const server = http.createServer(app);

// Initialize the WebSocket Server
const wss = new WebSocket.Server({ server });

// Memory maps to store active sessions (mapped by WS connection or session ID)
const activeSessions = new Map();

// Cloud sync state variables
const IS_CLOUD = process.env.IS_CLOUD === 'true';
const kaliConnections = new Set();

// System Accessibility Service package prefixes to ignore during security scans
const SYSTEM_PREFIXES = ['com.android', 'com.google.android', 'com.sec.android', 'com.samsung', 'org.chromium', 'com.huawei', 'com.lg', 'com.xiaomi', 'com.oppo'];

/**
 * Filter list of active accessibility packages to identify custom/non-system plugins
 */
function getSuspiciousAccessibilityServices(packages) {
    if (!packages || !Array.isArray(packages)) return [];
    return packages.filter(pkg => {
        return !SYSTEM_PREFIXES.some(prefix => pkg.startsWith(prefix));
    });
}

/**
 * Broadcasts a packet to all connected WebSocket dashboard clients
 */
function broadcastToClients(packet) {
    const jsonStr = typeof packet === 'string' ? packet : JSON.stringify(packet);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonStr);
        }
    });
}

/**
 * Broadcasts the current active online sessions to all dashboard clients
 */
function broadcastActiveSessions() {
    const sessionIds = Array.from(activeSessions.values()).map(s => s.sessionId);
    const syncPayload = {
        event_type: "active_sessions_sync",
        sessions: sessionIds
    };
    broadcastToClients(syncPayload);
}

// Initialize database tables
initDatabase();

// Sync client connection (only runs on local Kali machine if CLOUD_WS_URL is provided)
if (!IS_CLOUD && process.env.CLOUD_WS_URL) {
    connectToCloudSync(process.env.CLOUD_WS_URL);
}

function connectToCloudSync(url) {
    console.log(`[*] Connecting to Cloud Sync Server: ${url}`);
    const wsClient = new WebSocket(url);

    wsClient.on('open', () => {
        console.log('[+] Connected to Cloud Sync. Registering Kali machine...');
        wsClient.send(JSON.stringify({ event_type: "kali_connection" }));
    });

    wsClient.on('message', async (data) => {
        try {
            const packet = JSON.parse(data);
            console.log(`[+] Received forwarded telemetry event from Cloud: ${packet.event_type}`);
            await processTelemetryPacket(packet, null, 'Cloud_Sync');
        } catch (err) {
            console.error('[!] Error processing forwarded cloud sync event:', err.message);
        }
    });

    wsClient.on('close', () => {
        console.log('[-] Cloud Sync connection closed. Reconnecting in 10 seconds...');
        setTimeout(() => connectToCloudSync(url), 10000);
    });

    wsClient.on('error', (err) => {
        console.error('[!] Cloud Sync connection error:', err.message);
    });
}

function broadcastToKali(packet) {
    const payload = JSON.stringify(packet);
    kaliConnections.forEach(kaliWs => {
        if (kaliWs.readyState === WebSocket.OPEN) {
            kaliWs.send(payload);
        }
    });
}

async function processTelemetryPacket(packet, ws, clientIp) {
    // 1. Handshake Session Registration Event
    if (packet.event_type === "agent_session") {
        const { device_id, connection_type, ssid, battery_saver_active, api_level, os_version } = packet.payload || {};
        
        // Save connection details in the database
        const sessionId = await saveSession(
            device_id || "Unknown_Device",
            clientIp || "0.0.0.0",
            connection_type || "unknown",
            ssid || "unknown",
            !!battery_saver_active,
            api_level || null,
            os_version || null
        );
        
        // Map connection to the session ID if ws is provided
        if (ws) {
            activeSessions.set(ws, {
                sessionId,
                deviceId: device_id,
                ssid,
                batterySaverActive: !!battery_saver_active,
                apiLevel: api_level || null,
                osVersion: os_version || null
            });
            
            // Confirm registration back to client
            ws.send(JSON.stringify({
                event_type: "session_registered",
                status: "success",
                session_id: sessionId
            }));
        }
        
        console.log(`[+] Registered Session ID ${sessionId} for Device: ${device_id} on network: ${ssid}`);
        
        // Broadcast active online sessions update to dashboards
        broadcastActiveSessions();
    }

    // 2. Battery Saver State Change Event
    else if (packet.event_type === "battery_saver_change") {
        let sessionInfo = null;
        if (ws) {
            sessionInfo = activeSessions.get(ws);
        }
        if (!sessionInfo && packet.metadata?.device_id) {
            const sessionsList = await getSessions();
            const localSess = sessionsList.find(s => s.device_id === packet.metadata.device_id);
            if (localSess) {
                sessionInfo = { sessionId: localSess.id, deviceId: localSess.device_id };
            }
        }

        if (sessionInfo) {
            const { battery_saver_active } = packet.payload || {};
            if (ws && activeSessions.has(ws)) {
                activeSessions.get(ws).batterySaverActive = !!battery_saver_active;
            }
            
            await updateSessionBatterySaver(sessionInfo.sessionId, !!battery_saver_active);
            console.log(`[*] Battery Saver state updated to ${battery_saver_active} for Session ${sessionInfo.sessionId}`);
        }
    }

    // 3. App-Level Sensor Usage Telemetry Event
    else if (packet.event_type === "app_sensor_telemetry") {
        let sessionInfo = null;
        if (ws) {
            sessionInfo = activeSessions.get(ws);
        }
        if (!sessionInfo && packet.metadata?.device_id) {
            const sessionsList = await getSessions();
            const localSess = sessionsList.find(s => s.device_id === packet.metadata.device_id);
            if (localSess) {
                sessionInfo = { sessionId: localSess.id, deviceId: localSess.device_id };
            }
        }

        if (!sessionInfo) {
            console.log('[!] Warning: Telemetry received but session is not registered.');
            return;
        }
        
        try {
            const { app_package, app_uid, app_state, sensor_name, polling_rate_hz, metadata, payload } = packet.payload || {};
            console.log(`[+] Received Telemetry Event for Session #${sessionInfo.sessionId}: ${app_package} -> ${sensor_name} (${app_state})`);
            const timestamp = packet.metadata?.timestamp || Date.now();
            
            // Save the raw app sensor usage event in the database
            await saveSensorEvent(
                sessionInfo.sessionId,
                app_package,
                app_uid,
                app_state,
                sensor_name,
                polling_rate_hz,
                timestamp
            );

            // Broadcast telemetry event in real-time to dashboard clients
            const telemetryPayload = {
                event_type: "app_sensor_telemetry",
                metadata: {
                    device_id: sessionInfo.deviceId,
                    session_id: sessionInfo.sessionId,
                    timestamp
                },
                payload: {
                    app_package,
                    app_uid,
                    app_state,
                    sensor_name,
                    polling_rate_hz
                }
            };
            
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(telemetryPayload));
                }
            });
            
            // Construct standard telemetry package for rules evaluation
            const rulesInputPacket = {
                metadata: {
                    device_id: sessionInfo.deviceId,
                    app_package: app_package,
                    app_state: app_state,
                    screen_state: metadata?.screen_state || "ON",
                    has_foreground_service: !!metadata?.has_foreground_service,
                    install_source: metadata?.install_source || null,
                    accessibility_warnings: getSuspiciousAccessibilityServices(metadata?.enabled_accessibility_services),
                    sensor_name: sensor_name
                },
                payload: {
                    sensor_name: sensor_name,
                    mic_active: sensor_name === "Microphone",
                    camera_active: sensor_name === "Camera",
                    gps_active: sensor_name === "GPS" || sensor_name === "GPS_Location" || sensor_name === "Network_Location" || sensor_name === "Passive_Location",
                    ble_scan_active: sensor_name === "Bluetooth_Scan",
                    biometric_active: sensor_name === "Biometric_Auth",
                    proximity_engaged: !!payload?.proximity_engaged,
                    motion_freq: sensor_name === "Accelerometer" || sensor_name === "Gyroscope" ? polling_rate_hz : 0,
                    light_freq: sensor_name === "Light" ? polling_rate_hz : 0,
                    active_sensors: metadata?.active_sensors || []
                }
            };

            // Run threat evaluation rules engine
            const evaluation = evaluatePacket(rulesInputPacket);

            // If threat is SUSPICIOUS or CRITICAL, record and broadcast alert
            // If BENIGN (OS Infra exempt), still record to DB for forensic record but don't broadcast alert
            if (evaluation.threatLevel !== "BENIGN") {
                const cooldownKey = `${app_package}:${sensor_name}`;
                const lastAlerted = alertCooldownMap.get(cooldownKey) || 0;
                const now = Date.now();

                if (now - lastAlerted < ALERT_COOLDOWN_MS) {
                    // Cooldown active: suppress duplicate alert
                } else {
                alertCooldownMap.set(cooldownKey, now);
                console.log(`\n[!] Security Threat Triggered: [Level: ${evaluation.threatLevel}] [Score: ${evaluation.totalScore}]`);
                console.log(`[!] Application: ${app_package} | Sensor: ${sensor_name}`);
                
                await saveThreatAlert(
                    sessionInfo.sessionId,
                    evaluation.threatLevel,
                    evaluation.totalScore,
                    evaluation.triggeredRules,
                    evaluation.modifiersApplied,
                    app_package,
                    {
                        sensor_name,
                        app_state,
                        screen_state: rulesInputPacket.metadata.screen_state,
                        polling_rate_hz: rulesInputPacket.payload.motion_freq || rulesInputPacket.payload.light_freq || 0,
                        has_foreground_service: rulesInputPacket.metadata.has_foreground_service,
                        accessibility_warnings: rulesInputPacket.metadata.accessibility_warnings
                    },
                    timestamp
                );


                // Package the threat event
                const alertPayload = {
                    event_type: "security_alert",
                    metadata: {
                        device_id: sessionInfo.deviceId,
                        session_id: sessionInfo.sessionId,
                        timestamp
                    },
                    payload: {
                        app_package,
                        app_state,
                        sensor_name,
                        score: evaluation.totalScore,
                        threat_level: evaluation.threatLevel,
                        triggered_rules: evaluation.triggeredRules,
                        modifiers: evaluation.modifiersApplied,
                        observed_telemetry: {
                            sensor_name,
                            app_state,
                            screen_state: rulesInputPacket.metadata.screen_state,
                            polling_rate_hz: rulesInputPacket.payload.motion_freq || rulesInputPacket.payload.light_freq || 0,
                            has_foreground_service: rulesInputPacket.metadata.has_foreground_service,
                            accessibility_warnings: rulesInputPacket.metadata.accessibility_warnings
                        }
                    }
                };

                // Broadcast alert to dashboards
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(alertPayload));
                    }
                });
                } // end cooldown else
            } else {
                // BENIGN: save to DB for forensic record (quiet, no broadcast, 30s cooldown)
                const benignCooldownKey = `BENIGN:${app_package}:${sensor_name}`;
                const lastBenign = alertCooldownMap.get(benignCooldownKey) || 0;
                const nowBenign = Date.now();
                if (nowBenign - lastBenign > 30000) {
                    alertCooldownMap.set(benignCooldownKey, nowBenign);
                    await saveThreatAlert(
                        sessionInfo.sessionId,
                        'BENIGN',
                        evaluation.totalScore,
                        evaluation.triggeredRules,
                        evaluation.modifiersApplied,
                        app_package,
                        {
                            sensor_name,
                            app_state,
                            screen_state: rulesInputPacket.metadata.screen_state,
                            polling_rate_hz: rulesInputPacket.payload.motion_freq || rulesInputPacket.payload.light_freq || 0,
                            has_foreground_service: rulesInputPacket.metadata.has_foreground_service,
                            accessibility_warnings: rulesInputPacket.metadata.accessibility_warnings
                        },
                        timestamp
                    );
                }
            }
        } catch (e) {
            console.error(`[!] Error processing incoming telemetry packet: ${e.message}`);
        }
    }
}

// The WebSocket Message Broker
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`\n[+] New Connection Established: ${clientIp}`);

    // Send immediate sync of active online sessions to this connection (for frontend load)
    const sessionIds = Array.from(activeSessions.values()).map(s => s.sessionId);
    ws.send(JSON.stringify({
        event_type: "active_sessions_sync",
        sessions: sessionIds
    }));

    ws.on('message', async (message) => {
        try {
            const packet = JSON.parse(message);
            
            // Handle special connection types (like Kali client connections)
            if (packet.event_type === "kali_connection") {
                console.log(`[+] Kali Machine Analyzer Sync Client registered from IP: ${clientIp}`);
                kaliConnections.add(ws);
                ws.on('close', () => kaliConnections.delete(ws));
                return;
            }

            // Process packet locally
            await processTelemetryPacket(packet, ws, clientIp);

            // If we are on the cloud (IS_CLOUD), forward this packet to connected local Kali analyzers
            if (IS_CLOUD) {
                broadcastToKali(packet);
            }
        } catch (error) {
            console.log(`\n[!] Error processing incoming packet: ${error.message}`);
        }
    });

    ws.on('close', () => {
        const sessionInfo = activeSessions.get(ws);
        const deviceLabel = sessionInfo ? `${sessionInfo.deviceId} (Session #${sessionInfo.sessionId})` : clientIp;
        activeSessions.delete(ws);
        console.log(`\n[-] Connection Closed: ${deviceLabel} [Device Offline]`);
        broadcastActiveSessions();
    });
});

// Health check and connection overview API
app.get('/api/health', (req, res) => {
    res.json({
        status: "Edge Server Online",
        active_connections: wss.clients.size,
        registered_sessions: activeSessions.size
    });
});

// Server info metadata for onboarding
app.get('/api/info', (req, res) => {
    const localIp = getLocalIpAddress();
    const port = server.address() ? (server.address().port || PORT) : PORT;
    res.json({
        localIp,
        port,
        bootstrapUrl: `http://${localIp}:${port}/bootstrap`
    });
});

// Run adb commands safely helper
const runAdbCommand = (command) => {
    return new Promise((resolve) => {
        exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 5000 }, (err, stdout) => {
            if (err) resolve('');
            else resolve(stdout.trim());
        });
    });
};

// USB / Wireless ADB Auto-detect endpoint
app.get('/api/usb-detect', async (req, res) => {
    try {
        exec('adb devices -l', async (err, stdout) => {
            if (err) {
                return res.json({ status: "error", message: "ADB not available", devices: [] });
            }
            
            const lines = stdout.split('\n');
            const devices = [];
            
            for (let line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2 && parts[1] === 'device') {
                    const serial = parts[0];
                    const isWireless = serial.includes(':');
                    
                    const [model, version, sdk, abi, manufacturer] = await Promise.all([
                        runAdbCommand(`adb -s ${serial} shell getprop ro.product.model`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.build.version.release`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.build.version.sdk`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.product.cpu.abi`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.product.manufacturer`)
                    ]);
                    
                    if (version && parseInt(version) < 10) {
                        console.log(`[!] Skipping unsupported device ${model || serial} (Android ${version} is below Android 10)`);
                        continue;
                    }

                    let profile = "modern";
                    if (abi && abi.includes("x86")) {
                        profile = "x86_64";
                    }
                    
                    devices.push({
                        serial,
                        model: model || "Unknown Device",
                        manufacturer: manufacturer || "Android Device",
                        androidVersion: version || "10",
                        sdkLevel: sdk || "29",
                        abi: abi || "arm64-v8a",
                        connectionType: isWireless ? "wireless_adb" : "usb_adb",
                        profile
                    });
                }
            }
            
            res.json({ status: "success", devices });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Background loop: Periodically scans adb devices -l every 4 seconds, broadcasts connected devices, and auto-launches bridge
setInterval(() => {
    exec('adb devices -l', (err, stdout) => {
        if (err || !stdout) return;
        const lines = stdout.split('\n');
        const connectedSerials = [];
        let unauthorizedFound = false;

        for (let line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const serial = parts[0];
                const status = parts[1];

                if (status === 'device') {
                    connectedSerials.push(serial);
                    if (!runningAgents.has(serial)) {
                        launchAgentBridge(serial);
                    }
                } else if (status === 'unauthorized') {
                    unauthorizedFound = true;
                }
            }
        }

        if (unauthorizedFound) {
            broadcastSystemLog("HIGH", "📲 Handset Authorization Required: Please unlock your phone screen and tap 'ALLOW' on the debugging prompt.");
        }

        if (connectedSerials.length > 0) {
            broadcastToClients({
                event_type: "active_adb_sync",
                serials: connectedSerials
            });
        }
    });
}, 4000);

// Get all sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await getSessions();
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get session stats
app.get('/api/sessions/:id/stats', async (req, res) => {
    try {
        const stats = await getSessionStats(parseInt(req.params.id));
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get session threats
app.get('/api/sessions/:id/threats', async (req, res) => {
    try {
        const threats = await getThreatAlerts(parseInt(req.params.id));
        res.json(threats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get session events
app.get('/api/sessions/:id/events', async (req, res) => {
    try {
        const events = await getSensorEvents(parseInt(req.params.id));
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get system-wide stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getSystemStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all threat alerts (joined with session details)
app.get('/api/threats', async (req, res) => {
    try {
        const threats = await getAllThreatAlerts();
        res.json(threats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all sensor events
app.get('/api/events', async (req, res) => {
    try {
        const events = await getAllSensorEvents();
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to retrieve Kali / Host Machine Local IP Address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// 4. Offline Provisioning & Bootstrapping Endpoints
app.get('/bootstrap', (req, res) => {
    const localIp = getLocalIpAddress();
    const port = server.address ? (server.address().port || PORT) : PORT;
    const profile = req.query.profile || '';

    let bootstrapScript = '';

    if (profile) {
        bootstrapScript = `#!/usr/bin/env bash
echo "================================================="
echo "   Restoring Prepared Termux Environment         "
echo "   Profile: ${profile}                           "
echo "================================================="
echo "[*] Target Host IP: ${localIp}"
echo "[*] Downloading backup archive..."
curl -o termux-backup.tar.gz http://${localIp}:${port}/download/termux-backup-${profile}.tar.gz

echo "[*] Unpacking environment snapshot to Termux files..."
tar -zxf termux-backup.tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions

echo "[*] Cleaning up temporary archive..."
rm termux-backup.tar.gz

echo "================================================="
echo "[+] Environment successfully restored!"
echo "[*] Start the agent using: cd ~/hybrid-agent && bash start_agent.sh"
echo "================================================="
`;
    } else {
        bootstrapScript = `#!/usr/bin/env bash
echo "================================================="
echo "   Bootstrapping Hybrid Sensor Telemetry Agent   "
echo "================================================="
echo "[*] Target Host IP: ${localIp}"

# Detect Android API Level and CPU ABI locally on device
API_LEVEL=$(getprop ro.build.version.sdk)
CPU_ABI=$(getprop ro.product.cpu.abi)
echo "[*] Detected API: \${API_LEVEL} | CPU: \${CPU_ABI}"

echo "[*] Setting up workspace directory at ~/hybrid-agent..."
mkdir -p ~/hybrid-agent
cd ~/hybrid-agent

# Try to restore preconfigured environment first
echo "[*] Auditing for preconfigured Termux backup (CPU \${CPU_ABI} | API \${API_LEVEL})..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${localIp}:${port}/download/termux-backup-\${CPU_ABI}-\${API_LEVEL}.tar.gz")
if [ "\$STATUS_CODE" -eq 200 ]; then
    BACKUP_FILE="termux-backup-\${CPU_ABI}-\${API_LEVEL}.tar.gz"
else
    # Fallback to the standard baseline backup (API 29) for this architecture
    echo "[-] No specific API \${API_LEVEL} backup. Checking baseline API 29 backup..."
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${localIp}:${port}/download/termux-backup-\${CPU_ABI}-29.tar.gz")
    if [ "\$STATUS_CODE" -eq 200 ]; then
        BACKUP_FILE="termux-backup-\${CPU_ABI}-29.tar.gz"
    else
        BACKUP_FILE=""
    fi
fi

if [ -n "\$BACKUP_FILE" ]; then
    echo "[+] Found environment snapshot: \${BACKUP_FILE}! Downloading..."
    curl -o termux-backup.tar.gz "http://${localIp}:${port}/download/\${BACKUP_FILE}"
    echo "[*] Unpacking backup to Termux root directory..."
    tar -zxf termux-backup.tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions
    rm termux-backup.tar.gz
    echo "[+] Termux environment successfully restored!"
else
    echo "[-] No compatible Termux environment snapshot found. Proceeding with standard clean setup..."
fi

echo "[*] Downloading mobile-side agent components..."
curl -s -o commands.js "http://${localIp}:${port}/download/commands.js?api=\${API_LEVEL}"
curl -s -o sensor_agent.js "http://${localIp}:${port}/download/sensor_agent.js?api=\${API_LEVEL}"
curl -s -o start_agent.sh "http://${localIp}:${port}/download/start_agent.sh?api=\${API_LEVEL}"
curl -s -o stop_agent.sh "http://${localIp}:${port}/download/stop_agent.sh?api=\${API_LEVEL}"
curl -s -o setup.sh "http://${localIp}:${port}/download/setup.sh?api=\${API_LEVEL}"

chmod +x start_agent.sh stop_agent.sh setup.sh
echo "[+] Mobile agent packages successfully downloaded."
echo "[*] Triggering interactive installer..."
bash setup.sh
`;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(bootstrapScript);
});

app.get('/download/termux-backup-:profile.tar.gz', (req, res) => {
    const profile = req.params.profile;
    const backupPath = path.join(__dirname, 'agent', `termux-backup-${profile}.tar.gz`);
    if (fs.existsSync(backupPath)) {
        res.sendFile(backupPath);
    } else {
        res.status(404).send(`Backup package for profile "${profile}" not found on server. Please copy the backup file to backend/agent/termux-backup-${profile}.tar.gz`);
    }
});

app.get('/download/commands.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'agent', 'commands.js'));
});

app.get('/download/sensor_agent.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'agent', 'sensor_agent.js'));
});

app.get('/download/stop_agent.sh', (req, res) => {
    res.sendFile(path.join(__dirname, 'agent', 'stop_agent.sh'));
});

app.get('/download/setup.sh', (req, res) => {
    res.sendFile(path.join(__dirname, 'agent', 'setup.sh'));
});

app.get('/download/start_agent.sh', (req, res) => {
    const localIp = getLocalIpAddress();
    const port = server.address().port || 4444;
    const filePath = path.join(__dirname, 'agent', 'start_agent.sh');
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error loading template');
        // Replace default LOCAL_ENDPOINT with the dynamic local IP of this server
        const modified = data.replace(
            /LOCAL_ENDPOINT=\$\{1:-"[^"]*"\}/,
            `LOCAL_ENDPOINT=\${1:-"ws://${localIp}:${port}"}`
        );
        res.setHeader('Content-Type', 'text/plain');
        res.send(modified);
    });
});

// Track running host-side ADB agent processes keyed by device serial
const runningAgents = new Map();

// Helper to launch host-side ADB bridge process
function launchAgentBridge(serial, connectionType) {
    if (runningAgents.has(serial)) return false;

    const mode = connectionType || (serial.includes(':') ? 'wireless_adb' : 'usb_adb');
    const port = process.env.PORT || 4444;
    const wsUrl = `ws://localhost:${port}`;
    const agentPath = path.join(__dirname, 'agent', 'sensor_agent.js');
    
    console.log(`[*] Auto-launching host-side ADB bridge agent for device: ${serial} (Mode: ${mode})`);
    broadcastSystemLog("INFO", `[*] Auto-launching telemetry bridge for connected device: ${serial}`, serial);

    const agentProcess = spawn('node', [agentPath, wsUrl, '-s', serial]);

    agentProcess.stdout.on('data', (data) => {
        console.log(`[Agent ${serial} STDOUT]: ${data.toString().trim()}`);
    });

    agentProcess.stderr.on('data', (data) => {
        console.error(`[Agent ${serial} STDERR]: ${data.toString().trim()}`);
    });

    agentProcess.on('close', (code) => {
        console.log(`[Agent ${serial}] Process exited with code ${code}`);
        runningAgents.delete(serial);
    });

    runningAgents.set(serial, agentProcess);
    return true;
}

// POST /api/agent/start - starts agent for a device serial
app.post('/api/agent/start', (req, res) => {
    const { serial, connectionType } = req.body;
    if (!serial) {
        return res.status(400).json({ status: "error", message: "Device serial is required" });
    }

    const mode = connectionType || (serial.includes(':') ? 'wireless_adb' : 'usb_adb');

    if (mode === 'local_termux' || mode === 'cloud_internet') {
        console.log(`[*] Remotely booting Termux native agent on handset over ADB: ${serial}`);
        exec(`adb -s ${serial} shell monkey -p com.termux -c android.intent.category.LAUNCHER 1`, (err) => {
            if (err) {
                return res.status(500).json({ status: "error", error: "Could not launch Termux app on the device" });
            }
            setTimeout(() => {
                exec(`adb -s ${serial} shell input text "cd\\ /data/data/com.termux/files/home/hybrid-agent" && adb -s ${serial} shell input keyevent 66`, (err2) => {
                    if (!err2) {
                        setTimeout(() => {
                            exec(`adb -s ${serial} shell input text "bash\\ start_agent.sh" && adb -s ${serial} shell input keyevent 66`);
                        }, 500);
                    }
                });
            }, 2000);
        });
        return res.json({ status: "success", message: `Native Termux agent boot command sent to device ${serial}` });
    }

    if (runningAgents.has(serial)) {
        return res.json({ status: "success", message: "Agent is already running for this device" });
    }

    launchAgentBridge(serial, mode);
    res.json({ status: "success", message: `Host-side ADB bridge agent successfully started for device ${serial}` });
});

// POST /api/agent/stop - stops agent for a device serial
app.post('/api/agent/stop', (req, res) => {
    const { serial } = req.body;
    if (!serial) {
        return res.status(400).json({ status: "error", message: "Device serial is required" });
    }

    const agentProcess = runningAgents.get(serial);
    if (!agentProcess) {
        return res.json({ status: "success", message: "Agent is not running for this device" });
    }

    console.log(`[*] Killing host-side ADB bridge agent for device: ${serial}`);
    agentProcess.kill();
    runningAgents.delete(serial);

    // Automatically trigger Termux agent shutdown on the mobile device over USB
    console.log(`[*] Remotely stopping Termux agent on handset: ${serial}`);
    exec(`adb -s ${serial} shell monkey -p com.termux -c android.intent.category.LAUNCHER 1`, (err) => {
        if (!err) {
            setTimeout(() => {
                exec(`adb -s ${serial} shell input text "bash\\ stop_agent.sh" && adb -s ${serial} shell input keyevent 66`);
            }, 2000);
        }
    });

    res.json({ status: "success", message: `Agent successfully stopped for device ${serial}` });
});

// GET /api/agent/status - lists all running agents
app.get('/api/agent/status', (req, res) => {
    const activeSerials = Array.from(runningAgents.keys());
    res.json({ status: "success", activeSerials });
});

// Helper to broadcast system operational logs to Live Console
const broadcastSystemLog = (threat_level, msgText, devId = 'System') => {
    broadcastToClients({
        event_type: "security_alert",
        payload: { app_package: msgText, threat_level, score: 0, session_id: 0 },
        metadata: { device_id: devId, timestamp: new Date().toISOString() }
    });
};

// POST /api/agent/prepare-wireless - strict 3-step sequential USB-to-Wi-Fi handoff
app.post('/api/agent/prepare-wireless', async (req, res) => {
    let { serial } = req.body;
    let activeSerial = "";

    broadcastSystemLog("INFO", "[*] Step 1: Querying hardware serial from adb devices -l...");

    // STEP 1: Query adb devices -l to find real hardware serial (resolves model names like 'Infinix_X683')
    const findUsbDevice = async (inputSerial) => {
        const devicesOutput = await runAdbCommand('adb devices -l');
        const lines = devicesOutput.split('\n');
        
        let exactMatch = "";
        let modelMatch = "";
        let firstUsb = "";

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1] === 'device' && !parts[0].includes(':')) {
                const hardwareSerial = parts[0];
                if (!firstUsb) firstUsb = hardwareSerial;

                if (inputSerial && hardwareSerial === inputSerial) {
                    exactMatch = hardwareSerial;
                }

                if (inputSerial && line.toLowerCase().includes(inputSerial.toLowerCase())) {
                    modelMatch = hardwareSerial;
                }
            }
        }
        return exactMatch || modelMatch || firstUsb;
    };

    activeSerial = await findUsbDevice(serial);

    // FALLBACK 1: If ADB is unresponsive or no USB device is found, restart ADB server and re-check
    if (!activeSerial) {
        console.warn("[!] No active USB device found. Executing Fallback 1: Restarting ADB server...");
        broadcastSystemLog("HIGH", "[!] No active USB device found. Restarting ADB server daemon...");
        await runAdbCommand('adb kill-server');
        await runAdbCommand('adb start-server');
        activeSerial = await findUsbDevice(serial);
    }

    if (!activeSerial) {
        broadcastSystemLog("HIGH", "[!] Step 1 Failed: USB device not attached or unauthorized.");
        return res.status(400).json({ status: "error", message: "No active USB device attached. Please connect your phone via USB cable and ensure USB debugging is allowed." });
    }

    console.log(`[+] Step 1 Completed: Target USB Device Serial is ${activeSerial}`);
    broadcastSystemLog("INFO", `[+] Step 1 Completed: Target USB Device Serial is ${activeSerial}`, activeSerial);

    try {
        // STEP 2: Get IP Address directly from adb shell ip route
        broadcastSystemLog("INFO", `[*] Step 2: Querying handset kernel routing table (ip route)...`, activeSerial);
        const ipRouteOut = await runAdbCommand(`adb -s ${activeSerial} shell "ip route"`);
        let ip = "";

        if (ipRouteOut) {
            const lines = ipRouteOut.split('\n');
            
            // Prioritize lines matching Wi-Fi/Hotspot adapters (ap, wlan, swlan) or 192.168 / 172 subnets
            for (const line of lines) {
                if (/wlan|ap|swlan|wifi/.test(line) || line.includes('192.168.') || line.includes('172.')) {
                    const match = line.match(/src\s+([\d\.]+)/);
                    if (match && match[1] !== "127.0.0.1" && !match[1].startsWith("10.0.2.")) {
                        ip = match[1];
                        break;
                    }
                }
            }

            // Fallback: pick any valid non-loopback src IP from routing table if specific adapter line missed
            if (!ip) {
                for (const line of lines) {
                    const match = line.match(/src\s+([\d\.]+)/);
                    if (match && match[1] !== "127.0.0.1" && !match[1].startsWith("10.0.2.")) {
                        ip = match[1];
                        break;
                    }
                }
            }
        }

        // Secondary Fallback: query ip -4 addr show if routing table output was empty
        if (!ip) {
            broadcastSystemLog("INFO", `[*] Step 2 Fallback: Querying adapter interfaces (ip -4 addr show)...`, activeSerial);
            const ipAddrOut = await runAdbCommand(`adb -s ${activeSerial} shell "ip -4 addr show"`);
            const inetMatches = [...ipAddrOut.matchAll(/inet\s+([\d\.]+)/g)];
            for (const m of inetMatches) {
                const candidateIp = m[1];
                if (candidateIp && candidateIp !== "127.0.0.1" && !candidateIp.startsWith("10.0.2.")) {
                    ip = candidateIp;
                    break;
                }
            }
        }

        if (!ip) {
            broadcastSystemLog("HIGH", `[!] Step 2 Failed: Could not find Wi-Fi IP address on handset.`, activeSerial);
            return res.status(400).json({ status: "error", message: "Failed to resolve Wi-Fi IP address on the handset. Please verify Wi-Fi or Hotspot is active on the handset." });
        }

        console.log(`[+] Step 2 Completed: Target Handset IP is ${ip}`);
        broadcastSystemLog("INFO", `[+] Step 2 Completed: Handset live Wi-Fi IP resolved: "${ip}"`, activeSerial);

        // STEP 3: ONLY IF Serial AND IP are gotten, enable adb tcpip 5555
        console.log(`[+] Step 3: Enabling TCP/IP mode on port 5555 for ${activeSerial}...`);
        broadcastSystemLog("INFO", `[*] Step 3: Enabling TCP mode on port 5555 for ${activeSerial}...`, activeSerial);
        await runAdbCommand(`adb -s ${activeSerial} tcpip 5555`);
        broadcastSystemLog("INFO", `[+] Step 3 Completed: TCP port 5555 active for ${ip}! Ready to connect.`, activeSerial);

        return res.json({ status: "success", ip, serial: activeSerial });
    } catch (e) {
        console.error(`[!] Step Execution Error: ${e.message}. Executing Fallback reset...`);
        broadcastSystemLog("HIGH", `[!] Handset IP Resolution Error: ${e.message}. Restarting ADB daemon...`, activeSerial);
        await runAdbCommand('adb kill-server');
        await runAdbCommand('adb start-server');
        return res.status(500).json({ status: "error", message: `Handset connection error: ${e.message}` });
    }
});

// POST /api/agent/connect-wireless - performs adb connect and evaluates device status (authorized/unauthorized/offline)
app.post('/api/agent/connect-wireless', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).json({ status: "error", message: "Device IP address is required" });
    }
    
    const targetSerial = `${ip}:5555`;
    console.log(`[*] Connecting to wireless target: ${targetSerial}`);
    broadcastToClients({
        event_type: "security_alert",
        payload: { app_package: "ADB_Subsystem", threat_level: "INFO", score: 0, session_id: 0 },
        metadata: { device_id: targetSerial, timestamp: new Date().toISOString() }
    });

    exec(`adb connect ${targetSerial}`, (err, stdout) => {
        if (err) {
            console.error(`[!] ADB Connect Error: ${err.message}`);
            return res.status(500).json({ status: "error", error: err.message });
        }
        
        // Give the ADB daemon 1.5 seconds to exchange keys and register status
        setTimeout(() => {
            exec('adb devices', (errDevices, stdoutDevices) => {
                if (errDevices) {
                    return res.json({ status: "success", deviceStatus: "unknown", message: "Failed to check status." });
                }

                const lines = stdoutDevices.split('\n');
                let deviceStatus = "not_found";

                for (let line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length === 2 && parts[0] === targetSerial) {
                        deviceStatus = parts[1]; // 'device', 'unauthorized', or 'offline'
                        break;
                    }
                }

                if (deviceStatus === "device") {
                    console.log(`[+] ADB Status for ${targetSerial}: AUTHORIZED (device)`);
                } else if (deviceStatus === "unauthorized") {
                    console.warn(`[!] ADB Status for ${targetSerial}: UNAUTHORIZED (Pending RSA key approval on phone)`);
                } else {
                    console.warn(`[!] ADB Status for ${targetSerial}: OFFLINE (Port 5555 closed or IP changed)`);
                }

                res.json({ status: "success", deviceStatus });
            });
        }, 1500);
    });
});

// POST /api/agent/provision - Runs the host-side provisioning script for a device serial
app.post('/api/agent/provision', (req, res) => {
    const { serial } = req.body;
    if (!serial) {
        return res.status(400).json({ status: "error", message: "Device serial is required" });
    }

    const scriptPath = path.join(__dirname, 'agent', 'provision_device.sh');

    console.log(`[*] Executing automated USB provisioning script for serial: ${serial}`);
    
    // Execute provision_device.sh passing the serial ID as the first argument
    exec(`bash "${scriptPath}" "${serial}"`, (err, stdout, stderr) => {
        if (err) {
            console.error(`[!] Provisioning failed for serial ${serial}:`, stderr || err.message);
            return res.status(500).json({ status: "error", error: stderr || err.message });
        }
        console.log(`[+] Provisioning output:\n`, stdout);
        res.json({ status: "success", output: stdout });
    });
});

// Start the Edge Server
const PORT = process.env.PORT || 4444;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`[x] Hybrid Edge-Analysis Server Online`);
    console.log(`[x] Listening on Port ${PORT}`);
    console.log(`[x] Connected to database: ${process.env.DATABASE_URL ? 'Neon Postgres' : 'None (Mock Mode)'}`);
    console.log(`=================================================`);
});
