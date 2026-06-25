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
                connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
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
async function saveSession(device_id, ip_address, connection_type, ssid, battery_saver_active) {
    if (!connectionString) return null;
    const query = `
        INSERT INTO sessions (device_id, ip_address, connection_type, ssid, battery_saver_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `;
    const res = await pool.query(query, [device_id, ip_address, connection_type, ssid, battery_saver_active]);
    return res.rows[0].id;
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

module.exports = {
    initDatabase,
    saveSession,
    updateSessionBatterySaver,
    saveSensorEvent,
    saveThreatAlert,
    pool
};
