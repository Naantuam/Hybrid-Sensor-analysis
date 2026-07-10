/**
 * read_db.js - Diagnostic script to print database entries
 */

const { Pool } = require('pg');
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
if (!connectionString) {
    console.error('[!] DATABASE_URL not set in environment or .env!');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log('[*] Querying sessions...');
        const sessions = await pool.query('SELECT * FROM sessions ORDER BY id DESC LIMIT 5;');
        console.table(sessions.rows);

        console.log('[*] Querying recent sensor events...');
        const events = await pool.query('SELECT * FROM sensor_events ORDER BY id DESC LIMIT 15;');
        console.table(events.rows);

        console.log('[*] Querying recent threat alerts...');
        const alerts = await pool.query('SELECT * FROM threat_alerts ORDER BY id DESC LIMIT 10;');
        console.table(alerts.rows);
    } catch (e) {
        console.error('[!] Error:', e.message);
    } finally {
        await pool.end();
    }
}

main();
