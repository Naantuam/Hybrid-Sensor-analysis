const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('[!] Error: DATABASE_URL environment variable is missing.');
    console.error('[*] Usage: DATABASE_URL="your-connection-string" node tests/clean_db.js');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function cleanDatabase() {
    console.log('[*] Connecting to database to clear tables...');
    const client = await pool.connect();
    try {
        console.log('[*] Truncating threat_alerts, sensor_events, and sessions tables...');
        
        // Truncate tables and restart auto-increment counters, cascade handles foreign keys
        await client.query('TRUNCATE TABLE sessions, sensor_events, threat_alerts RESTART IDENTITY CASCADE;');
        
        console.log('[+] Database successfully cleared of all mock data.');
    } catch (err) {
        console.error('[!] Error clearing database:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

cleanDatabase();
