/**
 * rules.js - Generalized Tactics Threat Detection Matrix
 * Part of the Hybrid Sensor Monitoring Framework
 */

const RULES = {
    // 1. Tactic: Collection (Sensor access profiles)
    COLLECTION_LOW_FREQ: { id: "COLLECTION_LOW_FREQ", points: 5, description: "App polls any sensor at low frequency (<=20Hz)", tactic: "Collection", mitre: "T1636" },
    COLLECTION_HIGH_FREQ: { id: "COLLECTION_HIGH_FREQ", points: 20, description: "App polls motion/light sensors at ultra-high frequency (>100Hz)", tactic: "Collection", mitre: "T1429" },
    COLLECTION_MIC: { id: "COLLECTION_MIC", points: 20, description: "Microphone active", tactic: "Collection", mitre: "T1430" },
    COLLECTION_CAMERA: { id: "COLLECTION_CAMERA", points: 20, description: "Camera active", tactic: "Collection", mitre: "T1125" },

    // 2. Tactic: Context State (Access permissions and OS context)
    STATE_FOREGROUND: { id: "STATE_FOREGROUND", points: 0, description: "Hardware access in foreground (Authorized)", tactic: "Context" },
    STATE_BACKGROUND: { id: "STATE_BACKGROUND", points: 25, description: "Hardware access in background (High Risk)", tactic: "Context" },
    STATE_SCREEN_OFF: { id: "STATE_SCREEN_OFF", points: 30, description: "Sensor telemetry streams while device display is OFF", tactic: "Context" },
    CONTEXT_BG_VIOLATION: { id: "CONTEXT_BG_VIOLATION", points: 50, description: "Critical: High-Value Target accessed in background", tactic: "Context" },

    // 3. Tactic: Discovery (Proximity & Hardware scanning)
    DISCOVERY_FUSION: { id: "DISCOVERY_FUSION", points: 20, description: "Simulating multiple zero-permission sensor reads simultaneously", tactic: "Discovery", mitre: "T1427" },
    DISCOVERY_BLE: { id: "DISCOVERY_BLE", points: 15, description: "Bluetooth scan active", tactic: "Discovery", mitre: "T1636" },
    DISCOVERY_GPS: { id: "DISCOVERY_GPS", points: 15, description: "GPS location active", tactic: "Discovery", mitre: "T1636" },

    // 4. Tactic: Exfiltration (Data staging and egress)
    EXFIL_STAGING: { id: "EXFIL_STAGING", points: 15, description: "Telemetry volume indicates large local JSON buffer write operations", tactic: "Exfiltration", mitre: "T1430" },
    EXFIL_IMMEDIATE: { id: "EXFIL_IMMEDIATE", points: 40, description: "Immediate telemetry exfiltration upon network discovery", tactic: "Exfiltration", mitre: "T1041" },

    // 5. Tactic: Defense Evasion
    EVASION_LOG_DELETE: { id: "EVASION_LOG_DELETE", points: 30, description: "Indicator removal on host (log/file deletion)", tactic: "Defense Evasion", mitre: "T1403" },
    EVASION_ACCESSIBILITY: { id: "EVASION_ACCESSIBILITY", points: 15, description: "Accessibility Services active for non-system packages", tactic: "Defense Evasion", mitre: "T1406" },
    EVASION_BIOMETRIC: { id: "EVASION_BIOMETRIC", points: 10, description: "Biometric authentication bypass/abuse", tactic: "Defense Evasion", mitre: "T1406" }
};

/**
 * Evaluates a telemetry packet against the tactics-based risk matrix.
 * @param {Object} packet - The normalized telemetry packet.
 * @param {Object} systemContext - Current OS-level intent triggers.
 */
function evaluatePacket(packet, systemContext = {}) {
    let totalScore = 0;
    let triggeredRules = [];
    let modifiersApplied = [];

    const payload = packet.payload || {};
    const metadata = packet.metadata || {};

    // --- Phase 1: Base Scoring ---

    // 1. Check Context State Tactic
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

    // 2. Check Collection Tactic
    let hvtTriggered = false;
    if (payload.mic_active) {
        totalScore += RULES.COLLECTION_MIC.points;
        triggeredRules.push(RULES.COLLECTION_MIC);
        hvtTriggered = true;
    }
    if (payload.camera_active) {
        totalScore += RULES.COLLECTION_CAMERA.points;
        triggeredRules.push(RULES.COLLECTION_CAMERA);
        hvtTriggered = true;
    }
    if (payload.motion_freq > 0 && payload.motion_freq <= 20) {
        totalScore += RULES.COLLECTION_LOW_FREQ.points;
        triggeredRules.push(RULES.COLLECTION_LOW_FREQ);
    }
    if (payload.motion_freq > 100) {
        totalScore += RULES.COLLECTION_HIGH_FREQ.points;
        triggeredRules.push(RULES.COLLECTION_HIGH_FREQ);
    }

    // 3. Check Discovery Tactic
    if (payload.gps_active) {
        totalScore += RULES.DISCOVERY_GPS.points;
        triggeredRules.push(RULES.DISCOVERY_GPS);
        hvtTriggered = true;
    }
    if (payload.ble_scan_active) {
        totalScore += RULES.DISCOVERY_BLE.points;
        triggeredRules.push(RULES.DISCOVERY_BLE);
        hvtTriggered = true;
    }
    if (payload.sensor_fusion_active || payload.fusion_active) {
        totalScore += RULES.DISCOVERY_FUSION.points;
        triggeredRules.push(RULES.DISCOVERY_FUSION);
    }

    // 4. Check Exfiltration Tactic
    if (payload.exfil_staging_active || payload.exfil_stage) {
        totalScore += RULES.EXFIL_STAGING.points;
        triggeredRules.push(RULES.EXFIL_STAGING);
    }
    if (payload.exfil_immediate_active) {
        totalScore += RULES.EXFIL_IMMEDIATE.points;
        triggeredRules.push(RULES.EXFIL_IMMEDIATE);
    }

    // 5. Check Defense Evasion Tactic
    if (payload.log_deletion_active || payload.evasion_log_delete) {
        totalScore += RULES.EVASION_LOG_DELETE.points;
        triggeredRules.push(RULES.EVASION_LOG_DELETE);
    }
    if (payload.biometric_active) {
        totalScore += RULES.EVASION_BIOMETRIC.points;
        triggeredRules.push(RULES.EVASION_BIOMETRIC);
        hvtTriggered = true;
    }
    if (metadata.accessibility_warnings && metadata.accessibility_warnings.length > 0) {
        totalScore += RULES.EVASION_ACCESSIBILITY.points;
        triggeredRules.push(RULES.EVASION_ACCESSIBILITY);
        hvtTriggered = true;
    }

    // 6. Context Modifier: HVT in Background
    if (hvtTriggered && (metadata.app_state === "BACKGROUND" || metadata.screen_state === "OFF")) {
        totalScore += RULES.CONTEXT_BG_VIOLATION.points;
        triggeredRules.push(RULES.CONTEXT_BG_VIOLATION);
    }

    // --- Phase 2: Intent Filtering (Exemptions) ---

    // Exemption: Proximity (Phone to Ear)
    if (payload.proximity_engaged && metadata.screen_state === "OFF") {
        totalScore -= RULES.STATE_SCREEN_OFF.points;
        modifiersApplied.push("INTENT_PROXIMITY: Object detected near screen. Bypassing Screen Off penalty.");
    }

    // Exemption: Foreground Service (User Notification)
    if (metadata.has_foreground_service && metadata.app_state === "BACKGROUND") {
        totalScore -= RULES.STATE_BACKGROUND.points;
        const bgViolation = triggeredRules.find(r => r.id === "CONTEXT_BG_VIOLATION");
        if (bgViolation) totalScore -= RULES.CONTEXT_BG_VIOLATION.points;
        
        modifiersApplied.push("STATE_FG_SERVICE: Active notification detected. Bypassing Background penalties.");
    }

    // Exemption: System Toggles (GPS/Mic manually enabled)
    if (systemContext.recent_toggle && systemContext.toggle_time < 5000) {
        modifiersApplied.push(`INTENT_SYS_TOGGLE: User recently toggled ${systemContext.target}. Bypassing HVT penalty.`);
    }

    // Final Threat Level Calculation
    let threatLevel = "BENIGN";
    if (totalScore > 75) threatLevel = "CRITICAL";
    else if (totalScore > 50) threatLevel = "HIGH";
    else if (totalScore > 35) threatLevel = "SUSPICIOUS";

    return {
        totalScore: Math.max(0, totalScore),
        threatLevel,
        triggeredRules,
        modifiersApplied
    };
}

module.exports = { evaluatePacket };
