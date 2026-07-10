// backend/print_db.js
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

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

async function runDiagnostics() {
    if (connectionString) {
        console.log("[*] Connecting to Railway Postgres database...");
        const pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false }
        });

        try {
            console.log("\n=== REGISTERED SESSIONS (Postgres) ===");
            const sessionsRes = await pool.query(
                "SELECT id, device_id, connection_type, os_version, api_level, connected_at FROM sessions"
            );
            if (sessionsRes.rows.length === 0) {
                console.log("No sessions found.");
            } else {
                console.table(sessionsRes.rows);
            }

            console.log("\n=== RECENT SECURITY ALERTS (Postgres) ===");
            const alertsRes = await pool.query(
                "SELECT id, session_id, threat_level, score, app_package, to_timestamp(timestamp/1000) as time FROM threat_alerts ORDER BY id DESC LIMIT 10"
            );
            if (alertsRes.rows.length === 0) {
                console.log("No security alerts triggered yet.");
            } else {
                console.table(alertsRes.rows);
            }

            console.log("\n=== SENSOR TELEMETRY EVENT COUNTS (Postgres) ===");
            const countsRes = await pool.query(
                "SELECT sensor_name, COUNT(*) as count FROM sensor_events GROUP BY sensor_name"
            );
            if (countsRes.rows.length === 0) {
                console.log("No sensor events recorded yet.");
            } else {
                console.table(countsRes.rows);
            }

        } catch (err) {
            console.error("[!] Postgres diagnostics query failed:", err.message);
        } finally {
            await pool.end();
        }
    } else {
        console.log("[*] DATABASE_URL not set. Falling back to local SQLite database...");
        const sqlitePath = path.join(__dirname, 'sensor_local.db');
        try {
            const db = new DatabaseSync(sqlitePath);
            const query = (sql) => {
                const stmt = db.prepare(sql);
                return stmt.all();
            };

            console.log("\n=== REGISTERED SESSIONS (SQLite) ===");
            const sessions = query("SELECT id, device_id, connection_type, os_version, api_level, connected_at FROM sessions");
            if (sessions.length === 0) {
                console.log("No sessions found.");
            } else {
                console.table(sessions);
            }

            console.log("\n=== RECENT SECURITY ALERTS (SQLite) ===");
            const alerts = query("SELECT id, session_id, threat_level, score, app_package, datetime(timestamp/1000, 'unixepoch', 'localtime') as time FROM threat_alerts ORDER BY id DESC LIMIT 10");
            if (alerts.length === 0) {
                console.log("No security alerts triggered yet.");
            } else {
                console.table(alerts);
            }

            console.log("\n=== SENSOR TELEMETRY EVENT COUNTS (SQLite) ===");
            const counts = query("SELECT sensor_name, COUNT(*) as count FROM sensor_events GROUP BY sensor_name");
            if (counts.length === 0) {
                console.log("No sensor events recorded yet.");
            } else {
                console.table(counts);
            }
        } catch (err) {
            console.error("[!] SQLite diagnostics query failed:", err.message);
        }
    }
}

runDiagnostics();
