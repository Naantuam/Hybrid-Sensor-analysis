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
