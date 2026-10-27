# Hybrid Sensor Monitoring Framework
### Real-Time Android Hardware Sensor Telemetry & MITRE ATT&CK® Mobile Threat Detection

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)
[![MITRE ATT&CK](https://img.shields.io/badge/MITRE%20ATT%26CK-Mobile%20Matrix-red.svg)](https://attack.mitre.org/matrices/mobile/)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Linux-orange.svg)]()

---

## 📌 About The Project

Standard Android mobile security models create an **"Observability Gap"**: unprivileged and sandboxed applications can often query hardware sensors (such as the Accelerometer, Gyroscope, and Magnetometer) at high sampling rates without requiring explicit runtime user permissions. Malicious apps can exploit these hardware channels to conduct **side-channel attacks** (e.g., inferring keystrokes, capturing ambient vibration/sound, or tracking user location).

The **Hybrid Sensor Monitoring Framework** is an end-to-end, decoupled security monitoring and forensic analysis platform. It pairs a lightweight Android edge agent with an external Linux analysis engine and SOC dashboard to capture, correlate, and detect anomalous background sensor activities in real time, mapping findings directly to the **MITRE ATT&CK® for Mobile Matrix**.

---

## 🏗 System Architecture

The framework decouples data ingestion from analysis to bypass mobile battery, thermal, and sandboxing constraints while maintaining real-time SOC-level visibility.

```
+-----------------------------------------------------------------------------------+
|                            TARGET ANDROID DEVICE                                  |
|                                                                                   |
|  [Android Hardware SensorManager]                                                |
|            │                                                                      |
|            ▼ (termux-sensor polling)                                              |
|  [Edge Agent: sensor_agent.js] (Termux Runtime)                                   |
|            │                                                                      |
|            ▼ Normalizes {x, y, z} & attaches forensic metadata (Device ID, TS)    |
|  [WebSocket Client] ────(mDNS ZeroConf / Local Wi-Fi / Hotspot / Cloud)──────────┐|
+───────────────────────────────────────────────────────────────────────────────────┼+
                                                                                    │
                                                                                    ▼
+-----------------------------------------------------------------------------------+
|                        EXTERNAL ANALYSIS HOST (Linux)                             |
|                                                                                   |
|  [WebSocket Server & Ingestion Broker] (backend/edge_server.js)                   |
|            │                                                                      |
|            ├──▶ [SQLite Forensic Persistence] (sensor_local.db / db.js)           |
|            │                                                                      |
|            ▼                                                                      |
|  [Rule-Based Detection Engine] (backend/rules.js)                                 |
|      • Sampling frequency analysis (>100Hz anomaly thresholds)                    |
|      • Background vs Foreground execution differential                            |
|      • MITRE ATT&CK Mobile Technique Mapping (T1417, T1429, T1636.001)            |
|            │                                                                      |
|            ▼ Real-Time Incident Stream                                            |
|  [React + Vite SOC Dashboard] (src/App.jsx)                                       |
|      • Live 3-Axis Waveform Charts & Anomaly Indicators                           |
|      • Instant Threat Event Logs & MITRE Mobile Technique Attribution             |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

- **Decoupled Edge Telemetry**: Edge agent deployed via Termux continuously samples hardware SensorManager APIs and normalizes raw telemetry into structured JSON streams.
- **Resilient Zero-Config Networking**: Employs mDNS (`.local` Avahi broadcast) dynamic endpoint resolution and WebSocket full-duplex transport, ensuring reliable operation over local Wi-Fi, ad-hoc mobile hotspots, or reverse proxies.
- **Rule-Based Threat Detection Engine**: Continuously evaluates telemetry streams for high-frequency polling patterns, covert background listeners, and multi-sensor correlations.
- **Forensic MITRE ATT&CK® Tagging**: Real-time event tagging against Android mobile threat techniques:
  - **T1417 (Access Device Sensors)**: Unauthorized or suspicious sensor polling.
  - **T1429 (Access Sensitive Information)**: High-frequency sampling indicative of keystroke vibration sniffing or side-channel eavesdropping.
  - **T1636.001 (Sensor Sampling)**: Irregular sampling intervals indicative of device fingerprinting or motion tracking.
- **Live SOC Visualizer**: Interactive React dashboard providing 3-axis waveform plotting, anomaly alerts, connection health monitors, and historical forensic audits.

---

## 📁 Repository Structure

```text
├── agent/
│   └── sensor_agent.js          # Lightweight Node.js edge daemon executed on Android
├── backend/
│   ├── edge_server.js           # Full-duplex WebSocket server & telemetry ingestion broker
│   ├── rules.js                 # Rule-based threat detection & MITRE ATT&CK tagging engine
│   ├── db.js                    # SQLite database interface & persistence layer
│   └── print_db.js              # Forensic CLI utility to inspect captured sensor logs
├── src/
│   ├── App.jsx                  # Main SOC dashboard application
│   ├── components/              # Live charts, anomaly indicators, and alert panels
│   └── utils/                   # Telemetry parsing, metric calculations, and formatting
├── IMPLEMENTATION_REPORT.md     # Detailed architectural evolution and engineering roadmap
├── PROJECT_CONTEXT.md           # Theoretical threat model and academic background
├── package.json                 # Project dependencies and script runner configurations
└── vite.config.mjs              # Vite build configuration
```

---

## ⚙️ Quickstart & Deployment

### 1. Analysis Server & Dashboard Setup (Linux / Host)

Clone the repository and install dependencies:

```bash
git clone https://github.com/Naantuam/Hybrid-Sensor-analysis.git
cd Hybrid-Sensor-analysis
npm install
```

Start the backend analysis server and rule engine:

```bash
node backend/edge_server.js
```

In a separate terminal, launch the React SOC dashboard:

```bash
npm run dev
```

Navigate to `http://localhost:5173` to access the real-time monitoring console.

---

### 2. Android Edge Agent Deployment (Target Device)

1. Install **Termux** and the **Termux:API** package on the Android device.
2. Grant sensor permissions to Termux:API in Android Settings.
3. In Termux, install Node.js:
   ```bash
   pkg update && pkg install nodejs termux-api
   ```
4. Copy `agent/sensor_agent.js` onto the device, and launch the agent pointing to the host's mDNS hostname or IP:
   ```bash
   node sensor_agent.js ws://edge-monitor.local:4444
   # Or using IP: node sensor_agent.js ws://192.168.1.50:4444
   ```

The dashboard will immediately acknowledge the connection and begin plotting live telemetry and threat classifications.

---

## 🎯 Threat Detection Matrix

| MITRE ATT&CK ID | Threat Technique | Trigger Threshold / Rule Condition | Severity |
| :--- | :--- | :--- | :--- |
| **T1417** | **Access Device Sensors** | Unregistered or stealthy sensor listener initialized | Medium |
| **T1429** | **Access Sensitive Info** | Sustained sensor polling rate exceeding 100 Hz (Side-channel keylogging risk) | High |
| **T1636.001** | **Sensor Sampling** | Periodic high-resolution sampling intervals during idle screen state | High |

---

## 🎓 Academic Attribution & Author

- **Researcher:** Longmen Na’antuam Nathaniel
- **Institution:** Federal University of Technology, Minna (FUT Minna)
- **Degree:** B.Tech in Cyber Security Science
- **Thesis:** *A Hybrid Monitoring Framework for Detecting Suspicious Android Sensor Activities*
- **Profiles:** [GitHub](https://github.com/Naantuam) | [LinkedIn](https://www.linkedin.com/in/naantuam-longmen-51a656267/) | [Hack The Box](https://profile.hackthebox.com/profile/019e4c51-770a-72c8-aad5-a573b0d433ff)

---

## 📄 License
This project is open-source and developed for academic research, defensive mobile host observability, and security testing.
