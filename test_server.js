const WebSocket = require('ws');

const PORT = 4444;
const wss = new WebSocket.Server({ port: PORT });

console.log(`[+] WebSocket Server started on port ${PORT}`);
console.log(`[!] Use 'ngrok http ${PORT}' to expose this server (Note: use 'http' even for WS)`);

wss.on('connection', (ws) => {
    console.log('[+] Android Agent connected!');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[Telemetry] Device: ${data.metadata.device_id} | Event: ${data.event_type}`);
            console.log(JSON.stringify(data.payload, null, 2));
        } catch (e) {
            console.log('[!] Received non-JSON message:', message.toString());
        }
    });

    ws.on('close', () => {
        console.log('[-] Android Agent disconnected.');
    });
});
