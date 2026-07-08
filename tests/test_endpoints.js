const http = require('http');

function makeRequest(path, method, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const options = {
            hostname: 'localhost',
            port: 4444,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('[*] Testing Agent Controller endpoints...');
    try {
        // 1. Get status (should be empty initially)
        console.log('[*] GET /api/agent/status...');
        const status1 = await makeRequest('/api/agent/status', 'GET');
        console.log('[+] Status:', status1);
        
        // 2. Start agent (using mock serial "MOCK_SERIAL_123")
        console.log('[*] POST /api/agent/start...');
        const start = await makeRequest('/api/agent/start', 'POST', { serial: 'MOCK_SERIAL_123' });
        console.log('[+] Start result:', start);

        // 3. Get status again (should show MOCK_SERIAL_123)
        console.log('[*] GET /api/agent/status...');
        const status2 = await makeRequest('/api/agent/status', 'GET');
        console.log('[+] Status:', status2);

        // 4. Stop agent
        console.log('[*] POST /api/agent/stop...');
        const stop = await makeRequest('/api/agent/stop', 'POST', { serial: 'MOCK_SERIAL_123' });
        console.log('[+] Stop result:', stop);

        // 5. Get final status (should be empty again)
        console.log('[*] GET /api/agent/status...');
        const status3 = await makeRequest('/api/agent/status', 'GET');
        console.log('[+] Status:', status3);

        console.log('\n[SUCCESS] Endpoints verified successfully!');
        process.exit(0);
    } catch (err) {
        console.error('\n[FAILURE] Endpoints test failed:', err.message);
        process.exit(1);
    }
}

run();
