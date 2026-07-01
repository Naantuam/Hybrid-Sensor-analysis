const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
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
app.use(express.static('public'));

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
                            modifiers: evaluation.modifiersApplied
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

// Start the Edge Server
const PORT = process.env.PORT || 4444;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`[x] Hybrid Edge-Analysis Server Online`);
    console.log(`[x] Listening on Port ${PORT}`);
    console.log(`[x] Connected to database: ${process.env.DATABASE_URL ? 'Neon Postgres' : 'None (Mock Mode)'}`);
    console.log(`=================================================`);
});
