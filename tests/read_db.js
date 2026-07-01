/**
 * read_db.js - Diagnostic script to print database entries
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // load parent env if present

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
