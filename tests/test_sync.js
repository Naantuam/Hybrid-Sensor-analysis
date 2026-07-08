const { initDatabase, saveSession, saveSensorEvent, saveThreatAlert, getSessions, getSessionStats, getThreatAlerts, getSensorEvents } = require('../backend/db');

async function test() {
    console.log('[*] Testing Hybrid Sync Database Layer...');
    
    // Initialize DB (SQLite gets initialized)
    await initDatabase();

    const deviceId = 'TEST_DEVICE_SERIAL_999';
    console.log('[*] 1. Creating session in local database...');
    const sessId = await saveSession(
        deviceId,
        '192.168.1.55',
        'WIFI',
        'Office_5G',
        false,
        33,
        'Android 13'
    );
    console.log('[+] Session created with local ID:', sessId);

    // Verify it exists in local getSessions
    console.log('[*] 2. Querying sessions...');
    const sessions = await getSessions();
    const testSess = sessions.find(s => s.device_id === deviceId);
    if (!testSess) {
        throw new Error('Test session not found in local SQLite database');
    }
    console.log('[+] Session retrieved successfully:', testSess);

    // 3. Save raw sensor event
    console.log('[*] 3. Saving raw sensor event...');
    await saveSensorEvent(
        sessId,
        'com.suspicious.spyware',
        '10088',
        'BACKGROUND',
        'Microphone',
        0,
        Date.now()
    );
    console.log('[+] Sensor event saved.');

    // 4. Save threat alert
    console.log('[*] 4. Saving threat alert...');
    await saveThreatAlert(
        sessId,
        'CRITICAL',
        85,
        ['Background Microphone Audio Recording'],
        ['Modifier: Background state (+20)'],
        'com.suspicious.spyware',
        { sensor_name: 'Microphone', app_state: 'BACKGROUND' },
        Date.now()
    );
    console.log('[+] Threat alert saved.');

    // 5. Query stats & events
    console.log('[*] 5. Validating stats and list queries...');
    const stats = await getSessionStats(sessId);
    console.log('[+] Stats:', stats);
    if (stats.total_events !== 1 || stats.total_threats !== 1 || stats.max_score !== 85) {
        throw new Error(`Stats mismatch. Got: ${JSON.stringify(stats)}`);
    }

    const alerts = await getThreatAlerts(sessId);
    console.log('[+] Threat Alerts retrieved count:', alerts.length);
    if (alerts.length !== 1 || alerts[0].app_package !== 'com.suspicious.spyware') {
        throw new Error(`Threat alerts mismatch. Got: ${JSON.stringify(alerts)}`);
    }

    console.log('\n[SUCCESS] Unified Local SQLite database verified successfully!');
    process.exit(0);
}

test().catch(err => {
    console.error('\n[FAILURE] Database sync test failed:', err.message);
    process.exit(1);
});
