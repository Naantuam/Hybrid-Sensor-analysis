/**
 * rules.js - Generalized Tactics Threat Detection Matrix
 * Part of the Hybrid Sensor Monitoring Framework
 *
 * Scoring Philosophy:
 *  - Phase 1: Base sensor/context scoring (what is happening?)
 *  - Phase 2: Trust & coherence modifiers (who is doing it, and does it make sense?)
 *  - Phase 3: Multi-sensor correlation amplifiers (is this a coordinated surveillance pattern?)
 *  - Phase 4: Exemptions (proximity, foreground service, user toggles)
 */

// ─── Technique 1: App Trust Tiers ────────────────────────────────────────────
// Apps are classified into trust tiers that apply score modifiers.
const APP_TRUST_TIERS = {
    OS_INFRASTRUCTURE: {
        modifier: -50,
        label: "TRUST_OS_INFRA",
        description: "OS infrastructure package. Background sensor access is architecturally expected.",
        packages: [
            "com.google.android.gms",
            "com.google.android.gsf",
            "com.google.uid.shared",
            "com.android.location.fused",
            "com.android.phone",
            "com.android.server.telecom",
            "com.android.bluetooth",
            "com.android.nfc"
        ]
    },
    TRUSTED_SYSTEM: {
        modifier: -30,
        label: "TRUST_SYSTEM_APP",
        description: "Trusted OEM/system app. Sensor access is likely user-initiated.",
        packages: [
            "com.transsion.camera",
            "com.infinix.camera",
            "com.android.camera",
            "com.android.camera2",
            "com.transsion.magazineservice",
            "com.transsion.carlcare",
            "com.google.android.dialer",
            "com.android.dialer",
            "com.android.systemui",
            "com.android.settings"
        ]
    },
    KNOWN_APP: {
        modifier: -15,
        label: "TRUST_KNOWN_APP",
        description: "Known popular app. Sensor access is common but warrants monitoring.",
        packages: [
            "com.whatsapp",
            "com.instagram.android",
            "com.snapchat.android",
            "com.facebook.katana",
            "com.facebook.orca",
            "com.tiktok",
            "com.google.android.apps.maps",
            "com.google.android.youtube",
            "com.android.chrome",
            "com.opera.mini.native",
            "org.telegram.messenger",
            "com.viber.voip",
            "com.imo.android.imoim",
            "cn.xender",
            "com.shareit.lite"
        ]
    }
};

// ─── Technique 2: Sensor-App Coherence ────────────────────────────────────────
const SENSOR_COHERENCE = {
    camera:     ["Camera"],
    navigation: ["GPS_Location", "Network_Location", "Passive_Location"],
    social:     ["Microphone", "Camera", "GPS_Location", "Network_Location", "Bluetooth_Scan"],
    comms:      ["Microphone", "Camera", "GPS_Location", "Network_Location"],
    sharing:    ["Bluetooth_Scan", "Network_Location", "GPS_Location"],
    system:     ["Passive_Location", "Network_Location", "Bluetooth_Scan"]
};

function getAppCategory(pkgName) {
    if (!pkgName) return "unknown";
    const pkg = pkgName.toLowerCase();
    if (pkg.includes("camera") || pkg.includes("photo") || pkg.includes("gallery")) return "camera";
    if (pkg.includes("maps") || pkg.includes("navigation") || pkg.includes("uber") || pkg.includes("bolt")) return "navigation";
    if (pkg.includes("whatsapp") || pkg.includes("telegram") || pkg.includes("viber") ||
        pkg.includes("imo") || pkg.includes("facebook.orca") || pkg.includes("skype")) return "comms";
    if (pkg.includes("instagram") || pkg.includes("snapchat") || pkg.includes("tiktok") ||
        pkg.includes("facebook") || pkg.includes("twitter") || pkg.includes("youtube")) return "social";
    if (pkg.includes("xender") || pkg.includes("shareit") || pkg.includes("zapya")) return "sharing";
    if (pkg.includes("gms") || pkg.includes("gsf") || pkg.includes("bluetooth") ||
        pkg.includes("location") || pkg.includes("system") || pkg.includes("android")) return "system";
    return "unknown";
}

const RULES = {
    // 1. Collection
    COLLECTION_LOW_FREQ:  { id: "COLLECTION_LOW_FREQ",  points: 5,  description: "App polls any sensor at low frequency (<=20Hz)", tactic: "Collection", mitre: "T1636" },
    COLLECTION_HIGH_FREQ: { id: "COLLECTION_HIGH_FREQ", points: 20, description: "App polls motion/light sensors at ultra-high frequency (>100Hz)", tactic: "Collection", mitre: "T1429" },
    COLLECTION_MIC:       { id: "COLLECTION_MIC",       points: 20, description: "Microphone active", tactic: "Collection", mitre: "T1430" },
    COLLECTION_CAMERA:    { id: "COLLECTION_CAMERA",    points: 20, description: "Camera active", tactic: "Collection", mitre: "T1125" },

    // 2. Context State
    STATE_FOREGROUND:     { id: "STATE_FOREGROUND",     points: 0,  description: "Hardware access in foreground (Authorised)", tactic: "Context" },
    STATE_BACKGROUND:     { id: "STATE_BACKGROUND",     points: 25, description: "Hardware access in background (High Risk)", tactic: "Context" },
    STATE_SCREEN_OFF:     { id: "STATE_SCREEN_OFF",     points: 30, description: "Sensor telemetry streams while device display is OFF", tactic: "Context" },
    CONTEXT_BG_VIOLATION: { id: "CONTEXT_BG_VIOLATION", points: 50, description: "Critical: High-Value Target accessed in background", tactic: "Context" },

    // 3. Discovery
    DISCOVERY_FUSION:     { id: "DISCOVERY_FUSION",     points: 20, description: "Simulating multiple zero-permission sensor reads simultaneously", tactic: "Discovery", mitre: "T1427" },
    DISCOVERY_BLE:        { id: "DISCOVERY_BLE",        points: 15, description: "Bluetooth scan active", tactic: "Discovery", mitre: "T1636" },
    DISCOVERY_GPS:        { id: "DISCOVERY_GPS",        points: 15, description: "GPS location active", tactic: "Discovery", mitre: "T1636" },

    // 4. Exfiltration
    EXFIL_STAGING:        { id: "EXFIL_STAGING",        points: 15, description: "Telemetry volume indicates large local JSON buffer write operations", tactic: "Exfiltration", mitre: "T1430" },
    EXFIL_IMMEDIATE:      { id: "EXFIL_IMMEDIATE",      points: 40, description: "Immediate telemetry exfiltration upon network discovery", tactic: "Exfiltration", mitre: "T1041" },

    // 5. Defense Evasion
    EVASION_LOG_DELETE:        { id: "EVASION_LOG_DELETE",        points: 30, description: "Indicator removal on host (log/file deletion)", tactic: "Defense Evasion", mitre: "T1403" },
    EVASION_ACCESSIBILITY:     { id: "EVASION_ACCESSIBILITY",     points: 15, description: "Accessibility Services active for non-system packages", tactic: "Defense Evasion", mitre: "T1406" },
    EVASION_BIOMETRIC:         { id: "EVASION_BIOMETRIC",         points: 10, description: "Biometric authentication bypass/abuse", tactic: "Defense Evasion", mitre: "T1406" },
    EVASION_STATE_DISCREPANCY: { id: "EVASION_STATE_DISCREPANCY", points: 20, description: "App-declared state (Foreground) mismatches physical display status (OFF)", tactic: "Defense Evasion", mitre: "T1036" },

    // ── NEW: Technique 1 — Trust Tier Modifiers ───────────────────────────────
    TRUST_OS_INFRA:   { id: "TRUST_OS_INFRA",   points: -50, description: "OS infrastructure. Background sensor access is architecturally expected.", tactic: "Trust" },
    TRUST_SYSTEM_APP: { id: "TRUST_SYSTEM_APP", points: -30, description: "Trusted OEM/system app. Sensor access is likely user-initiated.", tactic: "Trust" },
    TRUST_KNOWN_APP:  { id: "TRUST_KNOWN_APP",  points: -15, description: "Known popular app. Sensor access is common but warrants monitoring.", tactic: "Trust" },

    // ── NEW: Technique 2 — Sensor-App Coherence ──────────────────────────────
    COHERENCE_MATCH:    { id: "COHERENCE_MATCH",    points: -10, description: "Sensor access is coherent with the app's declared purpose.", tactic: "Coherence" },
    COHERENCE_MISMATCH: { id: "COHERENCE_MISMATCH", points: 15,  description: "Sensor access is incoherent with app category (e.g. finance app accessing microphone).", tactic: "Coherence" },

    // ── NEW: Technique 3 — Multi-Sensor Correlation ───────────────────────────
    CORRELATION_AV_SYNC:    { id: "CORRELATION_AV_SYNC",    points: 35, description: "Camera and Microphone active simultaneously — AV capture pattern.", tactic: "Correlation", mitre: "T1512" },
    CORRELATION_TRACK_TRIO: { id: "CORRELATION_TRACK_TRIO", points: 50, description: "Camera + Microphone + Location active simultaneously — full surveillance profile.", tactic: "Correlation", mitre: "T1430" },
    CORRELATION_NET_SENSOR: { id: "CORRELATION_NET_SENSOR", points: 25, description: "Sensor collection concurrent with active exfiltration channel.", tactic: "Correlation", mitre: "T1041" },

    // ── NEW: Technique 4 — Origin Risk ───────────────────────────────────────
    ORIGIN_SIDELOADED: { id: "ORIGIN_SIDELOADED", points: 20, description: "Package not installed from Play Store — elevated risk origin.", tactic: "Origin", mitre: "T1476" }
};

function evaluatePacket(packet, systemContext = {}) {
    let totalScore = 0;
    let triggeredRules = [];
    let modifiersApplied = [];

    const payload = packet.payload || {};
    const metadata = packet.metadata || {};
    const appPackage = metadata.app_package || payload.app_package || "";

    // ── Phase 1: Base Scoring ─────────────────────────────────────────────────

    if (metadata.screen_state === "OFF") {
        totalScore += RULES.STATE_SCREEN_OFF.points;
        triggeredRules.push(RULES.STATE_SCREEN_OFF);
    } else if (metadata.app_state === "BACKGROUND") {
        totalScore += RULES.STATE_BACKGROUND.points;
        triggeredRules.push(RULES.STATE_BACKGROUND);
    } else {
        totalScore += RULES.STATE_FOREGROUND.points;
        triggeredRules.push(RULES.STATE_FOREGROUND);
    }

    let hvtTriggered = false;
    if (payload.mic_active)    { totalScore += RULES.COLLECTION_MIC.points;    triggeredRules.push(RULES.COLLECTION_MIC);    hvtTriggered = true; }
    if (payload.camera_active) { totalScore += RULES.COLLECTION_CAMERA.points; triggeredRules.push(RULES.COLLECTION_CAMERA); hvtTriggered = true; }
    if (payload.motion_freq > 0 && payload.motion_freq <= 20) { totalScore += RULES.COLLECTION_LOW_FREQ.points;  triggeredRules.push(RULES.COLLECTION_LOW_FREQ); }
    if (payload.motion_freq > 100)                            { totalScore += RULES.COLLECTION_HIGH_FREQ.points; triggeredRules.push(RULES.COLLECTION_HIGH_FREQ); }
    if (payload.gps_active)     { totalScore += RULES.DISCOVERY_GPS.points; triggeredRules.push(RULES.DISCOVERY_GPS); hvtTriggered = true; }
    if (payload.ble_scan_active){ totalScore += RULES.DISCOVERY_BLE.points; triggeredRules.push(RULES.DISCOVERY_BLE); hvtTriggered = true; }
    if (payload.sensor_fusion_active || payload.fusion_active) { totalScore += RULES.DISCOVERY_FUSION.points; triggeredRules.push(RULES.DISCOVERY_FUSION); }
    if (payload.exfil_staging_active || payload.exfil_stage)  { totalScore += RULES.EXFIL_STAGING.points;    triggeredRules.push(RULES.EXFIL_STAGING); }
    if (payload.exfil_immediate_active)  { totalScore += RULES.EXFIL_IMMEDIATE.points;   triggeredRules.push(RULES.EXFIL_IMMEDIATE); }
    if (payload.log_deletion_active)     { totalScore += RULES.EVASION_LOG_DELETE.points; triggeredRules.push(RULES.EVASION_LOG_DELETE); }
    if (payload.biometric_active)        { totalScore += RULES.EVASION_BIOMETRIC.points;  triggeredRules.push(RULES.EVASION_BIOMETRIC);  hvtTriggered = true; }
    if (metadata.accessibility_warnings && metadata.accessibility_warnings.length > 0) {
        totalScore += RULES.EVASION_ACCESSIBILITY.points;
        triggeredRules.push(RULES.EVASION_ACCESSIBILITY);
        hvtTriggered = true;
    }
    if (hvtTriggered && (metadata.app_state === "BACKGROUND" || metadata.screen_state === "OFF")) {
        totalScore += RULES.CONTEXT_BG_VIOLATION.points;
        triggeredRules.push(RULES.CONTEXT_BG_VIOLATION);
    }
    if (metadata.app_state === "FOREGROUND" && metadata.screen_state === "OFF") {
        totalScore += RULES.EVASION_STATE_DISCREPANCY.points;
        triggeredRules.push(RULES.EVASION_STATE_DISCREPANCY);
    }

    // ── Phase 2: Trust Tier Modifier (Technique 1) ────────────────────────────
    let trustModifier = 0;
    let trustRule = null;
    let isOsInfra = false;
    for (const [tierName, tier] of Object.entries(APP_TRUST_TIERS)) {
        if (tier.packages.some(p => appPackage === p || appPackage.startsWith(p + "."))) {
            trustModifier = tier.modifier;
            const ruleKey = `TRUST_${tierName === "OS_INFRASTRUCTURE" ? "OS_INFRA" : tierName === "TRUSTED_SYSTEM" ? "SYSTEM_APP" : "KNOWN_APP"}`;
            trustRule = RULES[ruleKey];
            isOsInfra = (tierName === "OS_INFRASTRUCTURE");
            break;
        }
    }
    if (trustModifier !== 0 && trustRule) {
        totalScore += trustModifier;
        triggeredRules.push(trustRule);
        modifiersApplied.push(`${trustRule.id}: ${trustRule.description} (${trustModifier > 0 ? "+" : ""}${trustModifier} pts)`);
    }

    // ── OS Infrastructure Full Context Exemption ──────────────────────────────
    // OS infrastructure packages (GMS, Bluetooth, Telecom) are LOCATION BROKERS
    // and SYSTEM SERVICES. They access sensors ON BEHALF OF other apps at the
    // OS level. Their safety profile is defined by 5 core security properties:
    //   1. Platform Certificate: Signed with Google/OEM platform key; user cannot sideload.
    //   2. Location Broker Role: Does not collect for itself; responds to requesting app APIs.
    //   3. Play Protect Verification: Scanned continuously against threat databases.
    //   4. Android App-Op Tracking: OS tracks requesting package UID, not broker.
    //   5. No Exfiltration Path: No local staging buffer or exfil channels present.
    // Therefore: CONTEXT_BG_VIOLATION and EVASION_STATE_DISCREPANCY do not apply.
    // The REQUESTING app (which asked GMS for location) is scored, not the broker.
    if (isOsInfra) {
        const bgViolIdx = triggeredRules.findIndex(r => r.id === "CONTEXT_BG_VIOLATION");
        if (bgViolIdx !== -1) {
            totalScore -= RULES.CONTEXT_BG_VIOLATION.points;
            triggeredRules.splice(bgViolIdx, 1);
        }
        const discrepIdx = triggeredRules.findIndex(r => r.id === "EVASION_STATE_DISCREPANCY");
        if (discrepIdx !== -1) {
            totalScore -= RULES.EVASION_STATE_DISCREPANCY.points;
            triggeredRules.splice(discrepIdx, 1);
        }
        modifiersApplied.push("OS_INFRA_EXEMPT: Platform-signed system service. BG_VIOLATION and STATE_DISCREPANCY penalties removed.");
    }

    // ── Phase 3: Sensor-App Coherence (Technique 2) ───────────────────────────
    const sensorName = payload.sensor_name || metadata.sensor_name || "";
    const appCategory = getAppCategory(appPackage);
    const coherentSensors = SENSOR_COHERENCE[appCategory] || [];

    if (appCategory !== "unknown" && sensorName) {
        if (coherentSensors.includes(sensorName)) {
            totalScore += RULES.COHERENCE_MATCH.points; // -10
            triggeredRules.push(RULES.COHERENCE_MATCH);
            modifiersApplied.push(`COHERENCE_MATCH: ${appCategory} app using ${sensorName} is expected. (-10 pts)`);
        } else if (["Camera", "Microphone", "GPS_Location"].includes(sensorName) && appCategory !== "system") {
            totalScore += RULES.COHERENCE_MISMATCH.points; // +15
            triggeredRules.push(RULES.COHERENCE_MISMATCH);
            modifiersApplied.push(`COHERENCE_MISMATCH: ${appCategory} app accessing ${sensorName} is atypical. (+15 pts)`);
        }
    }

    // ── Phase 4: Multi-Sensor Correlation (Technique 3) ──────────────────────
    const activeSensors = payload.active_sensors || [];
    const hasCamera = activeSensors.includes("Camera") || payload.camera_active;
    const hasMic    = activeSensors.includes("Microphone") || payload.mic_active;
    const hasGPS    = activeSensors.includes("GPS_Location") || activeSensors.includes("Network_Location") || payload.gps_active;

    if (hasCamera && hasMic && hasGPS) {
        totalScore += RULES.CORRELATION_TRACK_TRIO.points;
        triggeredRules.push(RULES.CORRELATION_TRACK_TRIO);
        modifiersApplied.push("CORRELATION_TRACK_TRIO: Camera + Mic + Location simultaneously. Full surveillance profile. (+50 pts)");
    } else if (hasCamera && hasMic) {
        totalScore += RULES.CORRELATION_AV_SYNC.points;
        triggeredRules.push(RULES.CORRELATION_AV_SYNC);
        modifiersApplied.push("CORRELATION_AV_SYNC: Camera + Microphone simultaneously. AV capture pattern. (+35 pts)");
    }
    if (hvtTriggered && (payload.exfil_staging_active || payload.exfil_immediate_active)) {
        totalScore += RULES.CORRELATION_NET_SENSOR.points;
        triggeredRules.push(RULES.CORRELATION_NET_SENSOR);
        modifiersApplied.push("CORRELATION_NET_SENSOR: HVT sensor + active exfiltration. (+25 pts)");
    }

    // ── Phase 5: Origin Risk (Technique 4) ───────────────────────────────────
    if (metadata.install_source &&
        metadata.install_source !== "com.android.vending" &&
        metadata.install_source !== "com.google.android.packageinstaller" &&
        appCategory === "unknown") {
        totalScore += RULES.ORIGIN_SIDELOADED.points;
        triggeredRules.push(RULES.ORIGIN_SIDELOADED);
        modifiersApplied.push(`ORIGIN_SIDELOADED: Installed from '${metadata.install_source}'. Elevated origin risk. (+20 pts)`);
    }

    // ── Phase 6: Intent Exemptions ────────────────────────────────────────────
    if (payload.proximity_engaged && metadata.screen_state === "OFF") {
        totalScore -= RULES.STATE_SCREEN_OFF.points;
        modifiersApplied.push("INTENT_PROXIMITY: Object near screen. Bypassing Screen Off penalty.");
    }
    if (metadata.has_foreground_service && metadata.app_state === "BACKGROUND") {
        totalScore -= RULES.STATE_BACKGROUND.points;
        const bgViolation = triggeredRules.find(r => r.id === "CONTEXT_BG_VIOLATION");
        if (bgViolation) totalScore -= RULES.CONTEXT_BG_VIOLATION.points;
        modifiersApplied.push("STATE_FG_SERVICE: Active notification detected. Bypassing Background penalties.");
    }
    if (systemContext.recent_toggle && systemContext.toggle_time < 5000) {
        modifiersApplied.push(`INTENT_SYS_TOGGLE: User recently toggled ${systemContext.target}.`);
    }

    // ── Final Classification ──────────────────────────────────────────────────
    // Thresholds calibrated so that CRITICAL requires genuine multi-factor evidence:
    //
    //   CRITICAL  >= 100  — Requires correlation (Camera+Mic, or BG+Screen-off+HVT+unknown)
    //                       A single background microphone event on an unknown app = 95 → HIGH.
    //                       Adding screen-off (covert) pushes it to 100 → CRITICAL.
    //                       Multi-sensor surveillance triad = 185 → CRITICAL.
    //
    //   HIGH      >= 60   — Serious concern: known app in background using HVT sensor,
    //                       OR unknown app using single HVT sensor in background.
    //
    //   SUSPICIOUS >= 25  — Worth monitoring: known app using GPS, BLE scan running,
    //                       or low-frequency motion sensor polling.
    //
    //   BENIGN     < 25   — Normal: foreground use, OS infra, FG-service-backed background use.
    const finalScore = Math.max(0, totalScore);
    let threatLevel = "BENIGN";
    if (finalScore >= 100)     threatLevel = "CRITICAL";
    else if (finalScore >= 60) threatLevel = "HIGH";
    else if (finalScore >= 25) threatLevel = "SUSPICIOUS";

    return { totalScore: finalScore, threatLevel, triggeredRules, modifiersApplied };
}

module.exports = { evaluatePacket, APP_TRUST_TIERS, SENSOR_COHERENCE };
