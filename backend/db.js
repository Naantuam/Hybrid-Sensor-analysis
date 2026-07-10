const { Pool } = require('pg');
const { DatabaseSync } = require('node:sqlite');
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

let connectionString = process.env.DATABASE_URL;
if (connectionString && (connectionString.includes('<') || connectionString.includes('>'))) {
    console.warn('\n[!] DATABASE_URL contains placeholders (e.g. <PROXY_HOST>). Falling back to local SQLite.');
    connectionString = null;
}
const isCloud = process.env.IS_CLOUD === 'true';

let pgPool = null;
if (connectionString) {
    pgPool = new Pool({
        connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

// Establish local SQLite database connection (primarily used for local storage on Kali)
const sqlitePath = path.join(__dirname, 'sensor_local.db');
const localDb = new DatabaseSync(sqlitePath);

/**
 * Initializes database schemas
 */
async function initDatabase() {
    // 1. Initialize local SQLite tables
    localDb.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE,
            ip_address TEXT,
            connection_type TEXT,
            ssid TEXT,
            battery_saver_active INTEGER DEFAULT 0,
            api_level INTEGER,
            os_version TEXT,
            connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced INTEGER DEFAULT 0
        );
    `);

    localDb.exec(`
        CREATE TABLE IF NOT EXISTS sensor_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            app_package TEXT,
            app_uid TEXT,
            app_state TEXT,
            sensor_name TEXT,
            polling_rate_hz INTEGER,
            timestamp INTEGER,
            synced INTEGER DEFAULT 0
        );
    `);

    localDb.exec(`
        CREATE TABLE IF NOT EXISTS threat_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            threat_level TEXT,
            score INTEGER,
            triggered_rules TEXT,
            modifiers TEXT,
            app_package TEXT,
            observed_telemetry TEXT,
            timestamp INTEGER,
            synced INTEGER DEFAULT 0
        );
    `);

    // 2. Initialize remote PG tables (if config string is available)
    if (connectionString) {
        const client = await pgPool.connect();
        try {
            console.log('[*] Initializing PG tables...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id SERIAL PRIMARY KEY,
                    device_id VARCHAR(100) UNIQUE,
                    ip_address VARCHAR(45),
                    connection_type VARCHAR(20),
                    ssid VARCHAR(100),
                    battery_saver_active BOOLEAN DEFAULT FALSE,
                    api_level INT,
                    os_version VARCHAR(20),
                    connected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS sensor_events (
                    id SERIAL PRIMARY KEY,
                    session_id INT REFERENCES sessions(id) ON DELETE CASCADE,
                    app_package VARCHAR(255),
                    app_uid VARCHAR(50),
                    app_state VARCHAR(20),
                    sensor_name VARCHAR(100),
                    polling_rate_hz INT,
                    timestamp BIGINT
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS threat_alerts (
                    id SERIAL PRIMARY KEY,
                    session_id INT REFERENCES sessions(id) ON DELETE CASCADE,
                    threat_level VARCHAR(20),
                    score INT,
                    triggered_rules JSONB,
                    modifiers JSONB,
                    app_package VARCHAR(255),
                    observed_telemetry JSONB,
                    timestamp BIGINT
                );
            `);
            console.log('[+] PG tables initialized successfully.');
        } catch (err) {
            console.error('[!] Error initializing PG:', err.message);
        } finally {
            client.release();
        }
    }

    // Start background auto-synchronizer loop
    setInterval(synchronizeOfflineData, 5000);
}

/**
 * Saves or updates a session
 */
async function saveSession(device_id, ip_address, connection_type, ssid, battery_saver_active, api_level = null, os_version = null) {
    const batterySaver = battery_saver_active ? 1 : 0;
    
    // 1. Write to SQLite
    let sessionId;
    const stmtCheck = localDb.prepare("SELECT id FROM sessions WHERE device_id = ?");
    const existing = stmtCheck.get(device_id);

    if (existing) {
        sessionId = existing.id;
        const stmtUpdate = localDb.prepare(`
            UPDATE sessions 
            SET ip_address = ?, connection_type = ?, ssid = ?, battery_saver_active = ?, 
                api_level = COALESCE(?, api_level), os_version = COALESCE(?, os_version), 
                connected_at = CURRENT_TIMESTAMP, synced = 0
            WHERE id = ?
        `);
        stmtUpdate.run(ip_address, connection_type, ssid, batterySaver, api_level, os_version, sessionId);
    } else {
        const stmtInsert = localDb.prepare(`
            INSERT INTO sessions (device_id, ip_address, connection_type, ssid, battery_saver_active, api_level, os_version, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `);
        const result = stmtInsert.run(device_id, ip_address, connection_type, ssid, batterySaver, api_level, os_version);
        sessionId = result.lastInsertRowid;
    }

    // 2. Try to sync immediately to PostgreSQL
    if (connectionString) {
        try {
            const pgSessionId = await syncSessionToPG({
                device_id, ip_address, connection_type, ssid, batterySaver, api_level, os_version
            });
            if (pgSessionId) {
                const stmtMark = localDb.prepare("UPDATE sessions SET synced = 1 WHERE id = ?");
                stmtMark.run(sessionId);
            }
        } catch (err) {
            console.error('[!] Immediate session sync failed:', err.message);
        }
    }

    return sessionId;
}

/**
 * Updates battery saver flag
 */
async function updateSessionBatterySaver(sessionId, batterySaverActive) {
    const batterySaver = batterySaverActive ? 1 : 0;
    // 1. Update SQLite
    const stmtUpdate = localDb.prepare("UPDATE sessions SET battery_saver_active = ?, synced = 0 WHERE id = ?");
    stmtUpdate.run(batterySaver, sessionId);

    // 2. Try immediate Postgres update
    if (connectionString) {
        const stmtGet = localDb.prepare("SELECT device_id FROM sessions WHERE id = ?");
        const session = stmtGet.get(sessionId);
        if (session) {
            try {
                await pgPool.query(`
                    UPDATE sessions SET battery_saver_active = $1 WHERE device_id = $2
                `, [!!batterySaverActive, session.device_id]);
                const stmtMark = localDb.prepare("UPDATE sessions SET synced = 1 WHERE id = ?");
                stmtMark.run(sessionId);
            } catch (err) {
                console.error('[!] Immediate battery saver sync failed:', err.message);
            }
        }
    }
}

/**
 * Saves a raw sensor event
 */
async function saveSensorEvent(sessionId, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp) {
    // 1. SQLite Write
    const stmtInsert = localDb.prepare(`
        INSERT INTO sensor_events (session_id, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmtInsert.run(sessionId, app_package, app_uid, app_state, sensor_name, polling_rate_hz, Number(timestamp));
    const localEventId = result.lastInsertRowid;

    // 2. Try immediate PostgreSQL sync
    if (connectionString) {
        const stmtGet = localDb.prepare("SELECT device_id FROM sessions WHERE id = ?");
        const session = stmtGet.get(sessionId);
        if (session) {
            try {
                const pgSessionId = await getPGSessionId(session.device_id);
                if (pgSessionId) {
                    await pgPool.query(`
                        INSERT INTO sensor_events (session_id, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [pgSessionId, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp]);
                    
                    const stmtMark = localDb.prepare("UPDATE sensor_events SET synced = 1 WHERE id = ?");
                    stmtMark.run(localEventId);
                }
            } catch (err) {
                console.error('[!] Immediate sensor event sync failed:', err.message);
            }
        }
    }
}

/**
 * Saves a threat alert
 */
async function saveThreatAlert(sessionId, threat_level, score, triggered_rules, modifiers, app_package, observed_telemetry, timestamp) {
    const rulesStr = JSON.stringify(triggered_rules);
    const modifiersStr = JSON.stringify(modifiers);
    const telemetryStr = JSON.stringify(observed_telemetry);

    // 1. SQLite Write
    const stmtInsert = localDb.prepare(`
        INSERT INTO threat_alerts (session_id, threat_level, score, triggered_rules, modifiers, app_package, observed_telemetry, timestamp, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmtInsert.run(sessionId, threat_level, score, rulesStr, modifiersStr, app_package, telemetryStr, Number(timestamp));
    const localAlertId = result.lastInsertRowid;

    // 2. Try immediate PostgreSQL sync
    if (connectionString) {
        const stmtGet = localDb.prepare("SELECT device_id FROM sessions WHERE id = ?");
        const session = stmtGet.get(sessionId);
        if (session) {
            try {
                const pgSessionId = await getPGSessionId(session.device_id);
                if (pgSessionId) {
                    await pgPool.query(`
                        INSERT INTO threat_alerts (session_id, threat_level, score, triggered_rules, modifiers, app_package, observed_telemetry, timestamp)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [pgSessionId, threat_level, score, rulesStr, modifiersStr, app_package, telemetryStr, timestamp]);
                    
                    const stmtMark = localDb.prepare("UPDATE threat_alerts SET synced = 1 WHERE id = ?");
                    stmtMark.run(localAlertId);
                }
            } catch (err) {
                console.error('[!] Immediate threat alert sync failed:', err.message);
            }
        }
    }
}

/**
 * Resolves Postgres Session ID for a device serial/ID
 */
async function getPGSessionId(deviceId) {
    if (!connectionString) return null;
    const res = await pgPool.query("SELECT id FROM sessions WHERE device_id = $1 LIMIT 1", [deviceId]);
    return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Creates/Updates session in PG and returns PG Session ID
 */
async function syncSessionToPG(session) {
    if (!connectionString) return null;
    const checkRes = await pgPool.query("SELECT id FROM sessions WHERE device_id = $1 LIMIT 1", [session.device_id]);
    
    if (checkRes.rows.length > 0) {
        const pgId = checkRes.rows[0].id;
        await pgPool.query(`
            UPDATE sessions 
            SET ip_address = $1, connection_type = $2, ssid = $3, battery_saver_active = $4,
                api_level = COALESCE($5, api_level), os_version = COALESCE($6, os_version),
                connected_at = CURRENT_TIMESTAMP
            WHERE id = $7
        `, [session.ip_address, session.connection_type, session.ssid, session.batterySaver === 1, session.api_level, session.os_version, pgId]);
        return pgId;
    } else {
        const insRes = await pgPool.query(`
            INSERT INTO sessions (device_id, ip_address, connection_type, ssid, battery_saver_active, api_level, os_version)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [session.device_id, session.ip_address, session.connection_type, session.ssid, session.batterySaver === 1, session.api_level, session.os_version]);
        return insRes.rows[0].id;
    }
}

/**
 * Background auto-synchronizer function
 */
async function synchronizeOfflineData() {
    if (!connectionString) return;

    try {
        // 1. Sync Sessions
        const unsyncedSessions = localDb.prepare("SELECT * FROM sessions WHERE synced = 0").all();
        for (const session of unsyncedSessions) {
            try {
                const pgId = await syncSessionToPG({
                    device_id: session.device_id,
                    ip_address: session.ip_address,
                    connection_type: session.connection_type,
                    ssid: session.ssid,
                    batterySaver: session.battery_saver_active,
                    api_level: session.api_level,
                    os_version: session.os_version
                });
                if (pgId) {
                    localDb.prepare("UPDATE sessions SET synced = 1 WHERE id = ?").run(session.id);
                }
            } catch (err) {
                console.error(`[!] Sync session error for ${session.device_id}:`, err.message);
            }
        }

        // 2. Sync Events
        const unsyncedEvents = localDb.prepare("SELECT * FROM sensor_events WHERE synced = 0 LIMIT 100").all();
        for (const event of unsyncedEvents) {
            try {
                const session = localDb.prepare("SELECT device_id FROM sessions WHERE id = ?").get(event.session_id);
                if (session) {
                    const pgSessionId = await getPGSessionId(session.device_id);
                    if (pgSessionId) {
                        await pgPool.query(`
                            INSERT INTO sensor_events (session_id, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [pgSessionId, event.app_package, event.app_uid, event.app_state, event.sensor_name, event.polling_rate_hz, event.timestamp]);
                        
                        localDb.prepare("UPDATE sensor_events SET synced = 1 WHERE id = ?").run(event.id);
                    }
                }
            } catch (err) {
                console.error(`[!] Sync event error:`, err.message);
            }
        }

        // 3. Sync Alerts
        const unsyncedAlerts = localDb.prepare("SELECT * FROM threat_alerts WHERE synced = 0 LIMIT 100").all();
        for (const alert of unsyncedAlerts) {
            try {
                const session = localDb.prepare("SELECT device_id FROM sessions WHERE id = ?").get(alert.session_id);
                if (session) {
                    const pgSessionId = await getPGSessionId(session.device_id);
                    if (pgSessionId) {
                        await pgPool.query(`
                            INSERT INTO threat_alerts (session_id, threat_level, score, triggered_rules, modifiers, app_package, observed_telemetry, timestamp)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [pgSessionId, alert.threat_level, alert.score, alert.triggered_rules, alert.modifiers, alert.app_package, alert.observed_telemetry, alert.timestamp]);
                        
                        localDb.prepare("UPDATE threat_alerts SET synced = 1 WHERE id = ?").run(alert.id);
                    }
                }
            } catch (err) {
                console.error(`[!] Sync alert error:`, err.message);
            }
        }
    } catch (err) {
        console.error('[!] Error in offline synchronization background loop:', err.message);
    }
}

/**
 * Retrieves all sessions
 */
async function getSessions() {
    if (connectionString) {
        const res = await pgPool.query("SELECT * FROM sessions ORDER BY connected_at DESC LIMIT 100");
        return res.rows;
    } else {
        const rows = localDb.prepare("SELECT * FROM sessions ORDER BY connected_at DESC LIMIT 100").all();
        return rows.map(r => ({
            id: r.id,
            device_id: r.device_id,
            ip_address: r.ip_address,
            connection_type: r.connection_type,
            ssid: r.ssid,
            battery_saver_active: r.battery_saver_active === 1,
            api_level: r.api_level,
            os_version: r.os_version,
            connected_at: r.connected_at
        }));
    }
}

/**
 * Retrieves stats for a session
 */
async function getSessionStats(sessionId) {
    if (connectionString) {
        const statsQuery = `
            SELECT 
                (SELECT COALESCE(MAX(score), 0) FROM threat_alerts WHERE session_id = $1) as max_score,
                (SELECT COUNT(*) FROM threat_alerts WHERE session_id = $1) as total_threats,
                (SELECT COUNT(*) FROM sensor_events WHERE session_id = $1) as total_events;
        `;
        const statsRes = await pgPool.query(statsQuery, [sessionId]);
        const appsQuery = `SELECT DISTINCT app_package FROM sensor_events WHERE session_id = $1`;
        const appsRes = await pgPool.query(appsQuery, [sessionId]);
        
        return {
            max_score: parseInt(statsRes.rows[0].max_score),
            total_threats: parseInt(statsRes.rows[0].total_threats),
            total_events: parseInt(statsRes.rows[0].total_events),
            active_apps: appsRes.rows.map(r => r.app_package)
        };
    } else {
        const maxScoreObj = localDb.prepare("SELECT COALESCE(MAX(score), 0) as max_score FROM threat_alerts WHERE session_id = ?").get(sessionId);
        const totalThreatsObj = localDb.prepare("SELECT COUNT(*) as total_threats FROM threat_alerts WHERE session_id = ?").get(sessionId);
        const totalEventsObj = localDb.prepare("SELECT COUNT(*) as total_events FROM sensor_events WHERE session_id = ?").get(sessionId);
        
        const activeApps = localDb.prepare("SELECT DISTINCT app_package FROM sensor_events WHERE session_id = ?").all(sessionId);
        
        return {
            max_score: maxScoreObj ? maxScoreObj.max_score : 0,
            total_threats: totalThreatsObj ? totalThreatsObj.total_threats : 0,
            total_events: totalEventsObj ? totalEventsObj.total_events : 0,
            active_apps: activeApps.map(a => a.app_package)
        };
    }
}

/**
 * Retrieves alerts for a session
 */
async function getThreatAlerts(sessionId) {
    if (connectionString) {
        const res = await pgPool.query("SELECT * FROM threat_alerts WHERE session_id = $1 ORDER BY timestamp DESC", [sessionId]);
        return res.rows;
    } else {
        const rows = localDb.prepare("SELECT * FROM threat_alerts WHERE session_id = ? ORDER BY timestamp DESC").all(sessionId);
        return rows.map(r => ({
            id: r.id,
            session_id: r.session_id,
            threat_level: r.threat_level,
            score: r.score,
            triggered_rules: JSON.parse(r.triggered_rules),
            modifiers: JSON.parse(r.modifiers),
            app_package: r.app_package,
            observed_telemetry: JSON.parse(r.observed_telemetry),
            timestamp: r.timestamp
        }));
    }
}

/**
 * Retrieves sensor events for a session
 */
async function getSensorEvents(sessionId) {
    if (connectionString) {
        const res = await pgPool.query("SELECT * FROM sensor_events WHERE session_id = $1 ORDER BY timestamp DESC LIMIT 200", [sessionId]);
        return res.rows;
    } else {
        return localDb.prepare("SELECT * FROM sensor_events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 200").all(sessionId);
    }
}

module.exports = {
    initDatabase,
    saveSession,
    updateSessionBatterySaver,
    saveSensorEvent,
    saveThreatAlert,
    getSessions,
    getSessionStats,
    getThreatAlerts,
    getSensorEvents,
    pool: pgPool
};
