# Implementation Progress Report: Hybrid Sensor Monitoring Framework
**Phase:** Core Telemetry Pipeline & Resilient Connectivity
**Date:** June 10, 2026

## 1. Achievements: From USB to Internet-Ready Exchange
We have successfully transitioned from a restricted, local-only setup to a flexible, production-ready telemetry pipeline.

*   **Communication Upgrade:** Successfully moved from raw TCP/Netcat to a full-duplex **WebSocket (WS)** protocol. This allows for real-time, bidirectional streaming between the Android Edge Agent and the Analysis Server.
*   **Data Normalization:** Resolved a critical "Parsing Error" by implementing a transformation layer in the `sensor_agent.js`. The agent now captures raw nested output from `termux-sensor`, flattens it into an `{x, y, z}` structure, and attaches forensic metadata before transmission.
*   **Zero-Config Networking:** Validated the use of mDNS (`.local` addressing) to bypass DHCP IP instability, ensuring the Infinix device can always locate the `edge-monitor` host.
*   **Server Robustness:** Hardened the `edge_server.js` with type-safe payload extraction and clear diagnostic logging, ensuring the system remains stable even if malformed packets are received.

## 2. The 8 Pillars of the Hybrid Framework
The following architectural pillars define the next evolution of the project:

1.  **Cloud-Native C2 Hosting:** Migrating the Node.js Broker to Render/Railway for a persistent, static endpoint.
2.  **Portable Runtime Agent:** Bundling a standalone Node.js binary on the Android device for environment isolation.
3.  **Dynamic Network Discovery (mDNS):** Finalizing the auto-discovery logic for seamless agent-to-server pairing.
4.  **Adaptive ADB/ADBE Automation:** Mapping commands to specific Android API levels for cross-device support.
5.  **Forensic Auditing (adbe):** Integrating ADB Enhanced for deep interrogation of app permissions and background states.
6.  **Agent-Controlled Lifecycle:** Local "Kill-Switch" controls via the Android terminal.
7.  **Offline Resiliency (Black Box):** Local JSON buffering for data persistence during network drops.
8.  **Payload Security (AES-256):** End-to-end encryption for telemetry data egress.

## 3. Immediate Roadmap: The Rule Engine
The focus now shifts from *transport* to *intelligence*.

### Next Task: `rules.js` Implementation
Instead of just displaying data, the server will now evaluate it against a "Threat Matrix."

**Key Metrics for Monitoring:**
*   **Polling Frequency:** Detecting unusually high sampling rates (e.g., >100Hz) which may indicate side-channel attacks.
*   **Background State Correlation:** Identifying sensor activity when the target app is not in the foreground.
*   **Event Correlation:** Matching accelerometer spikes with microphone or camera usage.

### Forensic Attribution & Background Visibility
A core strength of this framework is the ability to de-mask "silent" background sensor usage. We achieve this through:
*   **Process Correlation:** Using `adbe` and `dumpsys activity` to capture the `Package ID` and `UID` of the app currently holding an active sensor listener.
*   **Foreground/Background Differential:** The agent periodically polls the Activity Manager to determine if the sensor-using app is in the `TOP` (foreground) or `BACKGROUND` state.
*   **Identity Mapping:** Translating raw UIDs into human-readable app names (e.g., "Suspicious Calculator" is using the Gyroscope while the screen is off).

**Validation Strategy for Supervisor:**
1.  Launch `edge_server.js` with the new rule engine.
2.  Simulate "Suspicious Activity" on the Infinix device (e.g., high-frequency polling).
3.  Demonstrate the server triggering an **Alert Log** in real-time alongside the raw telemetry.

---
*Status: Ready for Rule Engine implementation.*

## 4. MITRE ATT&CK® for Mobile Integration
To elevate the framework from a data-streaming tool to a forensic security product, we are integrating the **MITRE ATT&CK® for Mobile (Android)** matrix.

### Strategic Mapping
The "Detection-Time Tagging" strategy will be used, where the Analysis Server evaluates telemetry against the matrix and "stamps" packets with MITRE metadata.

| MITRE ID | Technique | Contextual Trigger |
| :--- | :--- | :--- |
| **T1417** | **Access Device Sensors** | Base detection: Unauthorized or unexpected polling of hardware sensors. |
| **T1429** | **Access Sensitive Information** | High-frequency polling (>100Hz) indicative of side-channel attacks (e.g., keylogging via vibration). |
| **T1636.001**| **Sensor Sampling** | Monitoring sampling intervals to detect fingerprinting or location tracking via motion patterns. |

### Technical "Rule Stamping"
When the Rule Engine (`rules.js`) identifies a match, it will inject a `security_context` object into the telemetry stream:

```json
"security_context": {
    "threat_level": "HIGH",
    "mitre_attck": [
        {
            "id": "T1429",
            "technique": "Access Sensitive Information",
            "tactic": "Collection"
        }
    ]
}
```

This integration allows the final React Dashboard to provide SOC-level visibility, mapping hardware anomalies directly to industry-standard adversarial tactics and techniques.
