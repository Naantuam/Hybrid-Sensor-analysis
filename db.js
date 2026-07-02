const { Pool } = require('pg');

// Retrieve the database URL from environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('[!] Warning: DATABASE_URL environment variable is missing.');
}

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false // Required for Neon cloud connection security
    }
});

/**
 * Initializes database schemas if they do not exist
 */
async function initDatabase() {
    if (!connectionString) return;
    
    const client = await pool.connect();
    try {
        console.log('[*] Initializing Neon Database tables...');
        
        // 1. Sessions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(100),
                ip_address VARCHAR(45),
                connection_type VARCHAR(20),
                ssid VARCHAR(100),
                battery_saver_active BOOLEAN DEFAULT FALSE,
                api_level INT,
                os_version VARCHAR(20),
                connected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Migration: Ensure connected_at column uses TIMESTAMPTZ if table already existed
        await client.query(`
            ALTER TABLE sessions ALTER COLUMN connected_at TYPE TIMESTAMPTZ;
        `);
        
        // Migration: Ensure api_level and os_version columns exist
        await client.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS api_level INT;
        `);
        await client.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS os_version VARCHAR(20);
        `);

        // 2. App Sensor Usage Events table
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

        // 3. Threat Alerts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS threat_alerts (
                id SERIAL PRIMARY KEY,
                session_id INT REFERENCES sessions(id) ON DELETE CASCADE,
                threat_level VARCHAR(20),
                score INT,
                triggered_rules JSONB,
                modifiers JSONB,
                app_package VARCHAR(255),
                timestamp BIGINT
            );
        `);
        
        console.log('[+] Neon Database initialized successfully.');
    } catch (err) {
        console.error('[!] Error initializing database:', err.message);
    } finally {
        client.release();
    }
}

/**
 * Saves a new device connection session
 */
async function saveSession(device_id, ip_address, connection_type, ssid, battery_saver_active, api_level = null, os_version = null) {
    if (!connectionString) return null;
    
    // Check if a session already exists for this device_id
    const checkQuery = `
        SELECT id FROM sessions 
        WHERE device_id = $1 
        LIMIT 1;
    `;
    const checkRes = await pool.query(checkQuery, [device_id]);
    
    if (checkRes.rows.length > 0) {
        const existingId = checkRes.rows[0].id;
        // Update the existing session row with current parameters
        const updateQuery = `
            UPDATE sessions 
            SET ip_address = $1, 
                connection_type = $2, 
                ssid = $3, 
                battery_saver_active = $4, 
                api_level = COALESCE($5, api_level), 
                os_version = COALESCE($6, os_version),
                connected_at = CURRENT_TIMESTAMP
            WHERE id = $7;
        `;
        await pool.query(updateQuery, [
            ip_address, 
            connection_type, 
            ssid, 
            battery_saver_active, 
            api_level, 
            os_version, 
            existingId
        ]);
        return existingId;
    } else {
        // Create a new session row
        const insertQuery = `
            INSERT INTO sessions (device_id, ip_address, connection_type, ssid, battery_saver_active, api_level, os_version)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        const insertRes = await pool.query(insertQuery, [
            device_id, 
            ip_address, 
            connection_type, 
            ssid, 
            battery_saver_active, 
            api_level, 
            os_version
        ]);
        return insertRes.rows[0].id;
    }
}

/**
 * Updates the battery saver state for an active session
 */
async function updateSessionBatterySaver(sessionId, batterySaverActive) {
    if (!connectionString) return;
    const query = `
        UPDATE sessions
        SET battery_saver_active = $1
        WHERE id = $2;
    `;
    await pool.query(query, [batterySaverActive, sessionId]);
}

/**
 * Saves a specific sensor-using application event
 */
async function saveSensorEvent(sessionId, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp) {
    if (!connectionString) return;
    const query = `
        INSERT INTO sensor_events (session_id, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    await pool.query(query, [sessionId, app_package, app_uid, app_state, sensor_name, polling_rate_hz, timestamp]);
}

/**
 * Saves a threat alert evaluated by the rule engine
 */
async function saveThreatAlert(sessionId, threat_level, score, triggered_rules, modifiers, app_package, timestamp) {
    if (!connectionString) return;
    const query = `
        INSERT INTO threat_alerts (session_id, threat_level, score, triggered_rules, modifiers, app_package, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    await pool.query(query, [
        sessionId, 
        threat_level, 
        score, 
        JSON.stringify(triggered_rules), 
        JSON.stringify(modifiers), 
        app_package, 
        timestamp
    ]);
}

/**
 * Retrieves all sessions
 */
async function getSessions() {
    if (!connectionString) return [];
    const query = `
        SELECT * FROM sessions 
        ORDER BY connected_at DESC 
        LIMIT 100;
    `;
    const res = await pool.query(query);
    return res.rows;
}

/**
 * Retrieves aggregated stats for a specific session
 */
async function getSessionStats(sessionId) {
    if (!connectionString) return { max_score: 0, total_threats: 0, total_events: 0, active_apps: [] };
    
    const statsQuery = `
        SELECT 
            (SELECT COALESCE(MAX(score), 0) FROM threat_alerts WHERE session_id = $1) as max_score,
            (SELECT COUNT(*) FROM threat_alerts WHERE session_id = $1) as total_threats,
            (SELECT COUNT(*) FROM sensor_events WHERE session_id = $1) as total_events;
    `;
    const statsRes = await pool.query(statsQuery, [sessionId]);
    
    const appsQuery = `
        SELECT DISTINCT app_package FROM sensor_events WHERE session_id = $1;
    `;
    const appsRes = await pool.query(appsQuery, [sessionId]);
    
    return {
        max_score: parseInt(statsRes.rows[0].max_score),
        total_threats: parseInt(statsRes.rows[0].total_threats),
        total_events: parseInt(statsRes.rows[0].total_events),
        active_apps: appsRes.rows.map(r => r.app_package)
    };
}

/**
 * Retrieves threat alerts for a specific session
 */
async function getThreatAlerts(sessionId) {
    if (!connectionString) return [];
    const query = `
        SELECT * FROM threat_alerts 
        WHERE session_id = $1 
        ORDER BY timestamp DESC;
    `;
    const res = await pool.query(query, [sessionId]);
    return res.rows;
}

/**
 * Retrieves raw sensor events for a specific session
 */
async function getSensorEvents(sessionId) {
    if (!connectionString) return [];
    const query = `
        SELECT * FROM sensor_events 
        WHERE session_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 200;
    `;
    const res = await pool.query(query, [sessionId]);
    return res.rows;
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
    pool
};
