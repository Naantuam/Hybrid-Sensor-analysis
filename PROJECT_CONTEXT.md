# PROJECT CONTEXT & STATE DOCUMENTATION

**Project Title:** A Hybrid Monitoring Framework for Detecting Suspicious Android Sensor Activities
**Author:** Longmen Na’antuam Nathaniel (Federal University of Technology, Minna)
**Project Scope:** Final Year Thesis Project (B.Tech in Cyber Security Science)
**Academic Tone:** Formal, technical, forensic research-oriented.

## 1. Core Problem & Threat Model
The framework addresses the need for better visibility into Android sensor activities (Accelerometer, Gyroscope, Microphone, Magnetometer). By monitoring sensor data streams, the system identifies suspicious usage patterns that could indicate unauthorized access or data leakage. The goal is to bridge the "Observability Gap" in mobile security by providing real-time, SOC-level visibility into hardware sensor states.

## 2. The Hybrid System Architecture
The project utilizes a decoupled, three-component hybrid architecture to bypass mobile thermal/battery constraints while maintaining real-time SOC-level visibility.

### Component 1: The Android Edge Agent (Data Collection)
- **Environment:** Termux + Termux:API (bypassing standard Android sandboxing).
- **Engine:** Node.js running a lightweight script (sensor_agent.js).
- **Function:** Continuously polls Android SensorManager APIs (e.g., termux-sensor), packages raw hardware states into JSON, and tags them with forensic metadata (Device ID, Connection Type, Timestamp).

### Component 2: The Resilient Communication Bridge
- **Protocol:** Upgraded from raw TCP/Netcat to WebSockets (WS/WSS) for full-duplex, bidirectional, low-latency streaming.
- **Network Agility:** Implements Dynamic Endpoint Provisioning and Zero-Configuration Networking (ZeroConf) using mDNS (.local hostname resolution). It supports local Wi-Fi, Ad-Hoc Mobile Hotspots (Offline Fallback), and Cloud routing (Ngrok/Render/Railway) without hardcoded IPs.

### Component 3: The External Analysis Host & Dashboard
- **Environment:** Kali/BackBox Linux (Hostname: edge-monitor).
- **Backend:** Node.js rule-based detection engine that evaluates telemetry frequency, background activity, and event correlation.
- **Frontend:** React and Vite. Maps anomalies directly to the MITRE ATT&CK Mobile Matrix (e.g., T1429, T1417) for visual, human-readable incident response.

## 3. Current Technical State (Where We Paused)
- **Agent Scripting:** The `sensor_agent.js` script is fully operational. It accepts dynamic URLs via command-line arguments.
- **Local Networking:** Successfully bypassed DHCP IP-changing issues by renaming the Linux host to `edge-monitor` and using the Avahi/mDNS .local broadcast.
- **Data Pipeline:** The Android phone is successfully pushing live JSON telemetry (Accelerometer data) to the Linux machine over Wi-Fi.

## 4. Current Codebase: sensor_agent.js
(Running in Termux on the target Infinix device)
```javascript
const WebSocket = require('ws');
const { exec } = require('child_process');

// Accept the Target URL from the command line (e.g., ws://edge-monitor.local:4444)
const TARGET_URL = process.argv[2]; 

if (!TARGET_URL) {
    console.log('[!] Error: Target URL missing.');
    console.log('[*] Usage: node sensor_agent.js <ws://your-url>');
    process.exit(1);
}

const ws = new WebSocket(TARGET_URL);

ws.on('open', () => {
    console.log(`[+] Connected to Global Dashboard at ${TARGET_URL}`);

    setInterval(() => {
        exec('termux-sensor -s Accelerometer -n 1', (err, stdout) => {
            if (err) return;
            try {
                const rawSensorData = JSON.parse(stdout);
                
                const analysisPackage = {
                    event_type: "live_telemetry",
                    metadata: {
                        device_id: "Infinix_X683",
                        connection: "websocket_zeroconf",
                        timestamp: Date.now()
                    },
                    payload: rawSensorData
                };

                ws.send(JSON.stringify(analysisPackage));
            } catch(e) {}
        });
    }, 1000); 
});

ws.on('error', (error) => {
    console.log('[!] Connection failed. Is the server running?');
});

ws.on('close', () => {
    console.log('[-] Connection closed by server.');
});
```

## 5. Immediate Next Steps
1. Transition from basic Netcat listener to a proper Node.js/Express WebSocket Server.
2. Setup React/Vite Frontend Dashboard.
3. Expand Termux polling script (Gyroscope, Magnetometer, Microphone).
4. Develop Threat Detection Rule Engine.
