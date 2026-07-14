const { Pool } = require('pg');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
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

const connectionString = process.env.DATABASE_URL;

async function cleanDatabase() {
    // 1. Clear PostgreSQL database
    if (connectionString) {
        console.log('[*] Connecting to PostgreSQL database to clear tables...');
        const pool = new Pool({
            connectionString,
            ssl: {
                rejectUnauthorized: false
            }
        });
        let client;
        try {
            client = await pool.connect();
            console.log('[*] Truncating remote sessions, sensor_events, and threat_alerts tables...');
            await client.query('TRUNCATE TABLE sessions, sensor_events, threat_alerts RESTART IDENTITY CASCADE;');
            console.log('[+] PostgreSQL database successfully cleared of all mock/test data.');
        } catch (err) {
            console.error('[!] Error clearing PostgreSQL database:', err.message);
        } finally {
            if (client) client.release();
            await pool.end();
        }
    } else {
        console.log('[*] No DATABASE_URL found. Skipping PostgreSQL cleanup.');
    }

    // 2. Clear local SQLite database
    const sqlitePath = path.join(__dirname, '..', 'backend', 'sensor_local.db');
    if (fs.existsSync(sqlitePath)) {
        console.log('[*] Clearing local SQLite database...');
        try {
            const db = new DatabaseSync(sqlitePath);
            db.exec('DELETE FROM sessions;');
            db.exec('DELETE FROM sensor_events;');
            db.exec('DELETE FROM threat_alerts;');
            db.exec('VACUUM;');
            console.log('[+] Local SQLite database successfully cleared.');
        } catch (err) {
            console.error('[!] Error clearing SQLite database:', err.message);
        }
    } else {
        console.log('[*] Local SQLite database not found. Skipping SQLite cleanup.');
    }
}

cleanDatabase();
