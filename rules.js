/**
 * rules.js - Multi-Dimensional Risk Weighting Engine
 * Part of the Hybrid Sensor Monitoring Framework
 */

const RULES = {
    // Dimension 1: State Factors
    STATE_FG: { id: "STATE_FG", points: 0, description: "App in foreground" },
    STATE_COVERT_BG: { id: "STATE_COVERT_BG", points: 25, description: "App in background (no notification)" },
    STATE_SCREEN_OFF: { id: "STATE_SCREEN_OFF", points: 35, description: "Sensor access while screen is off" },

    // Dimension 2: High-Value Targets (HVT)
    HVT_AUDIO: { id: "HVT_AUDIO", points: 20, description: "Microphone active", mitre: "T1430" },
    HVT_CAMERA: { id: "HVT_CAMERA", points: 20, description: "Camera active", mitre: "T1125" },
    HVT_GPS: { id: "HVT_GPS", points: 15, description: "GPS location active", mitre: "T1636" },
    HVT_BG_VIOLATION: { id: "HVT_BG_VIOLATION", points: 50, description: "Critical: HVT accessed in background" },

    // Dimension 3: Side-Channels & Fusion
    S_VOL_HIGH: { id: "S_VOL_HIGH", points: 20, description: "High-frequency motion (>100Hz)", mitre: "T1429" },
    LIGHT_INFERENCE: { id: "LIGHT_INFERENCE", points: 25, description: "High-frequency light polling", mitre: "T1429" },
    FG_KEYLOG_ATTEMPT: { id: "FG_KEYLOG_ATTEMPT", points: 20, description: "Foreground motion side-channel", mitre: "T1429" },
    FUSION_LOCATION: { id: "FUSION_LOCATION", points: 20, description: "Sensor fusion location tracking", mitre: "T1427" },
    FUSION_AV: { id: "FUSION_AV", points: 25, description: "Motion + Audio correlation" }
};

/**
 * Evaluates a telemetry packet against the risk matrix.
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

    // 1. Check State
    if (metadata.screen_state === "OFF") {
        totalScore += RULES.STATE_SCREEN_OFF.points;
        triggeredRules.push(RULES.STATE_SCREEN_OFF);
    } else if (metadata.app_state === "BACKGROUND") {
        totalScore += RULES.STATE_COVERT_BG.points;
        triggeredRules.push(RULES.STATE_COVERT_BG);
    } else {
        triggeredRules.push(RULES.STATE_FG);
    }

    // 2. Check High-Value Targets
    let hvtTriggered = false;
    if (payload.mic_active) {
        totalScore += RULES.HVT_AUDIO.points;
        triggeredRules.push(RULES.HVT_AUDIO);
        hvtTriggered = true;
    }
    if (payload.camera_active) {
        totalScore += RULES.HVT_CAMERA.points;
        triggeredRules.push(RULES.HVT_CAMERA);
        hvtTriggered = true;
    }
    if (payload.gps_active) {
        totalScore += RULES.HVT_GPS.points;
        triggeredRules.push(RULES.HVT_GPS);
        hvtTriggered = true;
    }

    // 3. Critical Modifier: HVT in Background
    if (hvtTriggered && (metadata.app_state === "BACKGROUND" || metadata.screen_state === "OFF")) {
        // Only apply if not exempted by intent later
        totalScore += RULES.HVT_BG_VIOLATION.points;
        triggeredRules.push(RULES.HVT_BG_VIOLATION);
    }

    // 4. Side-Channels (Frequency Analysis)
    if (payload.motion_freq > 100) {
        totalScore += RULES.S_VOL_HIGH.points;
        triggeredRules.push(RULES.S_VOL_HIGH);
        if (metadata.app_state === "FOREGROUND") {
            totalScore += RULES.FG_KEYLOG_ATTEMPT.points;
            triggeredRules.push(RULES.FG_KEYLOG_ATTEMPT);
        }
    }

    if (payload.light_freq > 50) {
        totalScore += RULES.LIGHT_INFERENCE.points;
        triggeredRules.push(RULES.LIGHT_INFERENCE);
    }

    // --- Phase 2: Intent Filtering (Exemptions) ---

    // Exemption: Proximity (Phone to Ear)
    if (payload.proximity_engaged && metadata.screen_state === "OFF") {
        totalScore -= RULES.STATE_SCREEN_OFF.points;
        modifiersApplied.push("INTENT_PROXIMITY: Object detected near screen. Bypassing Screen Off penalty.");
    }

    // Exemption: Foreground Service (User Notification)
    if (metadata.has_foreground_service && metadata.app_state === "BACKGROUND") {
        totalScore -= RULES.STATE_COVERT_BG.points;
        // If HVT violation was added, remove it too because user is aware
        const hvtViolation = triggeredRules.find(r => r.id === "HVT_BG_VIOLATION");
        if (hvtViolation) totalScore -= RULES.HVT_BG_VIOLATION.points;
        
        modifiersApplied.push("STATE_FG_SERVICE: Active notification detected. Bypassing Background penalties.");
    }

    // Exemption: System Toggles (GPS/Mic manually enabled)
    if (systemContext.recent_toggle && systemContext.toggle_time < 5000) {
        modifiersApplied.push(`INTENT_SYS_TOGGLE: User recently toggled ${systemContext.target}. Bypassing HVT penalty.`);
        // Logic to subtract specific HVT points would go here
    }

    // Final Threat Level Calculation
    let threatLevel = "BENIGN";
    if (totalScore > 50) threatLevel = "CRITICAL";
    else if (totalScore > 20) threatLevel = "SUSPICIOUS";

    return {
        totalScore: Math.max(0, totalScore),
        threatLevel,
        triggeredRules,
        modifiersApplied
    };
}

module.exports = { evaluatePacket };
