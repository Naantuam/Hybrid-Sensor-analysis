const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const qrcode = require('qrcode-terminal');
const { 
    initDatabase, 
    saveSession, 
    updateSessionBatterySaver, 
    saveSensorEvent, 
    saveThreatAlert,
    getSessions,
    getSessionStats,
    getThreatAlerts,
    getSensorEvents
} = require('./db');
const { evaluatePacket } = require('./rules');

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
 * Broadcasts the current active online sessions to all dashboard clients
 */
function broadcastActiveSessions() {
    const sessionIds = Array.from(activeSessions.values()).map(s => s.sessionId);
    const syncPayload = {
        event_type: "active_sessions_sync",
        sessions: sessionIds
    };
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(syncPayload));
        }
    });
}

// Initialize Neon database tables
initDatabase();

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
            
            // 1. Handshake Session Registration Event
            if (packet.event_type === "agent_session") {
                const { device_id, connection_type, ssid, battery_saver_active, api_level, os_version } = packet.payload || {};
                
                // Save connection details in the database
                const sessionId = await saveSession(
                    device_id || "Unknown_Device",
                    clientIp,
                    connection_type || "unknown",
                    ssid || "unknown",
                    !!battery_saver_active,
                    api_level || null,
                    os_version || null
                );
                
                // Map connection to the session ID
                activeSessions.set(ws, {
                    sessionId,
                    deviceId: device_id,
                    ssid,
                    batterySaverActive: !!battery_saver_active,
                    apiLevel: api_level || null,
                    osVersion: os_version || null
                });
                
                console.log(`[+] Registered Session ID ${sessionId} for Device: ${device_id} on network: ${ssid}`);
                
                // Broadcast active sessions update to dashboards
                broadcastActiveSessions();
                
                // Confirm registration back to client
                ws.send(JSON.stringify({
                    event_type: "session_registered",
                    status: "success",
                    session_id: sessionId
                }));
            }

            // 2. Battery Saver State Change Event
            else if (packet.event_type === "battery_saver_change") {
                const sessionInfo = activeSessions.get(ws);
                if (sessionInfo) {
                    const { battery_saver_active } = packet.payload || {};
                    sessionInfo.batterySaverActive = !!battery_saver_active;
                    
                    await updateSessionBatterySaver(sessionInfo.sessionId, !!battery_saver_active);
                    console.log(`[*] Battery Saver state updated to ${battery_saver_active} for Session ${sessionInfo.sessionId}`);
                }
            }

            // 3. App-Level Sensor Usage Telemetry Event
            else if (packet.event_type === "app_sensor_telemetry") {
                const sessionInfo = activeSessions.get(ws);
                if (!sessionInfo) {
                    console.log('[!] Warning: Telemetry received but session is not registered.');
                    return;
                }
                
                const { app_package, app_uid, app_state, sensor_name, polling_rate_hz, metadata, payload } = packet.payload || {};
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
                
                // Construct standard telemetry package for rules evaluation
                const rulesInputPacket = {
                    metadata: {
                        device_id: sessionInfo.deviceId,
                        app_state: app_state,
                        screen_state: metadata?.screen_state || "ON",
                        has_foreground_service: !!metadata?.has_foreground_service,
                        accessibility_warnings: getSuspiciousAccessibilityServices(metadata?.enabled_accessibility_services)
                    },
                    payload: {
                        mic_active: sensor_name === "Microphone",
                        camera_active: sensor_name === "Camera",
                        gps_active: sensor_name === "GPS" || sensor_name === "GPS_Location" || sensor_name === "Network_Location",
                        ble_scan_active: sensor_name === "Bluetooth_Scan",
                        biometric_active: sensor_name === "Biometric_Auth",
                        proximity_engaged: !!payload?.proximity_engaged,
                        motion_freq: sensor_name === "Accelerometer" || sensor_name === "Gyroscope" ? polling_rate_hz : 0,
                        light_freq: sensor_name === "Light" ? polling_rate_hz : 0
                    }
                };

                // Run threat evaluation rules engine
                const evaluation = evaluatePacket(rulesInputPacket);

                // If threat is SUSPICIOUS or CRITICAL, record and broadcast alert
                if (evaluation.threatLevel !== "BENIGN") {
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

                    // Broadcast alert to other dashboards (e.g. React panel)
                    wss.clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(alertPayload));
                        }
                    });
                }
            }
        } catch (error) {
            console.log(`\n[!] Error processing incoming packet: ${error.message}`);
        }
    });

    ws.on('close', () => {
        activeSessions.delete(ws);
        console.log(`\n[-] Connection Closed: ${clientIp}`);
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
        exec(command, (err, stdout) => {
            if (err) resolve('');
            else resolve(stdout.trim());
        });
    });
};

// USB Auto-detect endpoint
app.get('/api/usb-detect', async (req, res) => {
    try {
        exec('adb devices', async (err, stdout) => {
            if (err) {
                return res.json({ status: "error", message: "ADB not available", devices: [] });
            }
            
            const lines = stdout.split('\n');
            const devices = [];
            
            for (let line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length === 2 && parts[1] === 'device') {
                    const serial = parts[0];
                    
                    const [model, version, sdk, abi] = await Promise.all([
                        runAdbCommand(`adb -s ${serial} shell getprop ro.product.model`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.build.version.release`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.build.version.sdk`),
                        runAdbCommand(`adb -s ${serial} shell getprop ro.product.cpu.abi`)
                    ]);
                    
                    let profile = "modern";
                    if (abi && abi.includes("x86")) {
                        profile = "x86_64";
                    } else if (version && parseInt(version) < 10) {
                        profile = "legacy";
                    }
                    
                    devices.push({
                        serial,
                        model: model || "Unknown Device",
                        androidVersion: version || "Unknown",
                        sdkLevel: sdk || "Unknown",
                        abi: abi || "Unknown",
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

# Detect Android API Level locally on device
API_LEVEL=$(getprop ro.build.version.sdk)
echo "[*] Detected Android API Level: \${API_LEVEL}"

echo "[*] Setting up workspace directory at ~/hybrid-agent..."
mkdir -p ~/hybrid-agent
cd ~/hybrid-agent

# Try to restore preconfigured environment first
echo "[*] Auditing for preconfigured Termux backup (API \${API_LEVEL})..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${localIp}:${port}/download/termux-backup-\${API_LEVEL}.tar.gz")
if [ "\$STATUS_CODE" -eq 200 ]; then
    echo "[+] Found preconfigured Termux snapshot! Downloading environment..."
    curl -o termux-backup.tar.gz "http://${localIp}:${port}/download/termux-backup-\${API_LEVEL}.tar.gz"
    echo "[*] Unpacking backup to Termux root directory..."
    tar -zxf termux-backup.tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions
    rm termux-backup.tar.gz
    echo "[+] Termux environment successfully restored!"
else
    echo "[-] No preconfigured Termux snapshot found for API \${API_LEVEL}. Proceeding with standard setup..."
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

// POST /api/agent/start - starts agent for a device serial
app.post('/api/agent/start', (req, res) => {
    const { serial } = req.body;
    if (!serial) {
        return res.status(400).json({ status: "error", message: "Device serial is required" });
    }

    if (runningAgents.has(serial)) {
        return res.json({ status: "success", message: "Agent is already running for this device" });
    }

    const localIp = getLocalIpAddress();
    const port = server.address ? (server.address().port || PORT) : PORT;
    const wsUrl = `ws://${localIp}:${port}`;

    const agentPath = path.join(__dirname, 'agent', 'sensor_agent.js');
    console.log(`[*] Spawning host-side ADB bridge agent for device: ${serial}`);
    
    // Spawn agent process: node sensor_agent.js <ws_url> -s <serial>
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
    res.json({ status: "success", message: `Agent successfully started for device ${serial}` });
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
    res.json({ status: "success", message: `Agent successfully stopped for device ${serial}` });
});

// GET /api/agent/status - lists all running agents
app.get('/api/agent/status', (req, res) => {
    const activeSerials = Array.from(runningAgents.keys());
    res.json({ status: "success", activeSerials });
});

// Start the Edge Server
const PORT = process.env.PORT || 4444;
server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    const bootstrapUrl = `http://${localIp}:${PORT}/bootstrap`;

    console.log(`=================================================`);
    console.log(`[x] Hybrid Edge-Analysis Server Online`);
    console.log(`[x] Listening on Port ${PORT}`);
    console.log(`[x] Connected to database: ${process.env.DATABASE_URL ? 'Neon Postgres' : 'None (Mock Mode)'}`);
    console.log(`=================================================`);
    console.log(`[*] LOCAL OFFLINE PROVISIONING FOR MOBILE DEVICES`);
    console.log(`[*] Scan this QR code in Termux (or run: curl -s ${bootstrapUrl} | bash) to setup the phone:`);
    console.log(`URL: ${bootstrapUrl}`);
    console.log(`=================================================`);
    qrcode.generate(bootstrapUrl, { small: true });
    console.log(`=================================================`);
});
