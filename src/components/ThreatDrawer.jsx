import React from 'react';
import { Activity, X, Database, ExternalLink } from 'lucide-react';

const ACADEMIC_DESCRIPTIONS = {
  COLLECTION_MIC: {
    mitre: "T1430",
    title: "Access Device Sensors: Microphone",
    tactic: "Collection",
    desc: "The application has initiated an active microphone recording handler. In mobile forensics, background or unauthorized audio recording is classified under MITRE T1430. Adversaries abuse this technique to capture private conversations, ambient room acoustics, or voice authentication data without user awareness."
  },
  COLLECTION_CAMERA: {
    mitre: "T1125",
    title: "Video Capture",
    tactic: "Collection",
    desc: "Active camera lens access detected. Mapped to MITRE T1125, visual data collection represents a critical vector for espionage. Background camera calls allow spyware to silently snap photos, capture video, or record screenshots of sensitive interfaces."
  },
  STATE_BACKGROUND: {
    mitre: "N/A",
    title: "Background Process Hardware Execution",
    tactic: "Context",
    desc: "The target app is querying hardware sensors while executing as a background daemon (without an active, user-visible Activity window). Legitimate apps require user interaction to request sensor feeds; background reads are indicative of stealth tracking or hidden side-channel analysis."
  },
  STATE_SCREEN_OFF: {
    mitre: "N/A",
    title: "Device Dormancy Telemetry Egress",
    tactic: "Context",
    desc: "Sensors are active while the physical display is asleep (Screen OFF). In security operations, telemetry egress during screen sleep confirms that data is being gathered when the user believes the handset is inert, a primary signature of spyware."
  },
  CONTEXT_BG_VIOLATION: {
    mitre: "N/A",
    title: "Critical Background Modification Escalation",
    tactic: "Context",
    desc: "A High-Value Target sensor (Microphone, Camera, or GPS) was queried while the application was running in the background. This is a critical security violation. Third-party packages should never request media resources without foreground visual components and notifications."
  },
  DISCOVERY_GPS: {
    mitre: "T1636.001",
    title: "Sensor Sampling: Location Tracking",
    tactic: "Discovery",
    desc: "Active GPS query executed. Mapped to MITRE T1636.001 (Sensor Sampling), location logging enables adversaries to construct full physical movements and user routines. Tracking spatial data without foreground UI context represents a covert reconnaissance pattern."
  },
  DISCOVERY_BLE: {
    mitre: "T1636.001",
    title: "Sensor Sampling: RF Beacon Fingerprinting",
    tactic: "Discovery",
    desc: "Active Bluetooth Low Energy (BLE) scanning. Under MITRE T1636.001, scanning for nearby BLE beacons or devices is used by trackers to fingerprint the user's micro-location inside buildings or proximity to other assets, bypassing standard GPS permissions."
  },
  EVASION_ACCESSIBILITY: {
    mitre: "T1406",
    title: "Defense Evasion: Accessibility Services Abuse",
    tactic: "Defense Evasion",
    desc: "A custom, non-system Accessibility Service is currently active. Under MITRE T1406, accessibility wrappers can read screen contents (keylogging), intercept passwords, click permissions dialogs automatically, and prevent user-initiated process termination."
  },
  EVASION_STATE_DISCREPANCY: {
    mitre: "T1036",
    title: "Defense Evasion: Process State Deception",
    tactic: "Defense Evasion",
    desc: "An application declared a FOREGROUND running priority state to Android subsystems (such as LocationManager) while the device's physical display was audited as OFF. Mapped to MITRE T1036 (Masquerading), this signature highlights processes abusing system-level exemptions or background services to collect user telemetry covertly while masquerading as user-authorized foreground tasks."
  }
};

export default function ThreatDrawer({ drawerOpen, setDrawerOpen, selectedThreat, getThreatColorClass, selectedSession }) {
  return (
    <>
      {/* SLIDE-OVER FORENSIC Incident Drawer (SPACIOUS DRAWER) */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:max-w-xl bg-[#0c0d17]/95 border-l border-cyan-500/20 shadow-[-10px_0_30px_rgba(0,0,0,0.8)] z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div>
            <h3 className="font-bold font-outfit text-base text-cyan-400 flex items-center gap-2">
              <Activity className="w-5 h-5 animate-pulse" />
              Forensic Incident Report
            </h3>
            <p className="text-[0.625rem] text-gray-500 uppercase tracking-widest mt-0.5">Auditing Security Telemetry</p>
          </div>
          <button 
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {selectedThreat ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 text-[#f3f4f6]">
            
            {/* HEADING 0: TARGET DEVICE DETAILS */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-l-2 border-cyan-400 pl-2">
                0. Device Identification
              </h4>
              <div className="bg-[#11121d] border border-white/5 rounded-2xl p-5 space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-400">Device model:</span>
                  <span className="font-semibold text-white">
                    {selectedThreat.device_id?.replace(/_/g, ' ') || selectedSession?.device_id?.replace(/_/g, ' ') || 'Unknown Device'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Android / API version:</span>
                  <span className="font-semibold text-white font-mono">
                    Android {selectedThreat.os_version || selectedSession?.os_version || 'N/A'} (API {selectedThreat.api_level || selectedSession?.api_level || 'N/A'})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Connection Mode:</span>
                  <span className="font-semibold text-white uppercase text-[10px] font-mono">
                    {selectedThreat.connection_type || selectedSession?.connection_type || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* HEADING 1: METRIC COMPONENT */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-l-2 border-cyan-400 pl-2">
                1. Metric Component (MC)
              </h4>
              <div className="bg-[#11121d] border border-white/5 rounded-2xl p-5 space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-400">Target Application Package:</span>
                  <span className="font-semibold text-white max-w-60 truncate">{selectedThreat.app_package}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Assigned Threat Level:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[0.5625rem] font-extrabold uppercase tracking-wide border ${getThreatColorClass(selectedThreat.threat_level)}`}>
                    {selectedThreat.threat_level}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Cumulative Risk Score:</span>
                  <span className="font-extrabold text-cyan-400 font-mono text-sm">{selectedThreat.score} points</span>
                </div>
                
                {/* Behavioural Sub-score indicators */}
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  <span className="text-gray-400 text-[0.625rem] font-extrabold uppercase tracking-wider block">Behavioural Sub-score Indicators:</span>
                  <div className="space-y-2">
                    {(() => {
                      const rules = Array.isArray(selectedThreat.triggered_rules) 
                        ? selectedThreat.triggered_rules 
                        : JSON.parse(selectedThreat.triggered_rules || '[]');
                      return rules.map((rule, idx) => (
                        <div key={idx} className="flex justify-between items-start bg-white/[0.02] px-3.5 py-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                          <div>
                            <span className="text-[0.625rem] text-cyan-500 font-bold uppercase block">{rule.tactic}</span>
                            <span className="text-[0.6875rem] text-gray-300 mt-0.5 block">{rule.description}</span>
                          </div>
                          <span className="font-mono text-cyan-400 font-bold ml-4">+{rule.points}</span>
                        </div>
                      ));
                    })()}
                    {(() => {
                      const modifiers = Array.isArray(selectedThreat.modifiers) 
                        ? selectedThreat.modifiers 
                        : JSON.parse(selectedThreat.modifiers || '[]');
                      return modifiers.map((mod, idx) => (
                        <div key={idx} className="text-[0.625rem] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                          🛡️ {mod}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* HEADING 2: VALUE / OBSERVED TELEMETRY */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-l-2 border-cyan-400 pl-2">
                2. Value / Observed Telemetry
              </h4>
              <div className="bg-[#05060b] border border-white/5 rounded-2xl p-5 font-mono text-[0.6875rem] text-cyan-400/90 leading-relaxed space-y-3">
                {(() => {
                  let telemetry = selectedThreat.observed_telemetry;
                  if (typeof telemetry === 'string') {
                    try { telemetry = JSON.parse(telemetry); } catch(e) {}
                  }
                  if (!telemetry) {
                    const rules = Array.isArray(selectedThreat.triggered_rules) 
                      ? selectedThreat.triggered_rules 
                      : JSON.parse(selectedThreat.triggered_rules || '[]');
                    
                    const hasMic = rules.some(r => r.id === 'COLLECTION_MIC');
                    const hasCamera = rules.some(r => r.id === 'COLLECTION_CAMERA');
                    const hasGps = rules.some(r => r.id === 'DISCOVERY_GPS');
                    const hasBle = rules.some(r => r.id === 'DISCOVERY_BLE');
                    const isScreenOff = rules.some(r => r.id === 'STATE_SCREEN_OFF');
                    const isBg = rules.some(r => r.id === 'STATE_BACKGROUND') || isScreenOff;
                    const hasAccess = rules.some(r => r.id === 'EVASION_ACCESSIBILITY');

                    telemetry = {
                      sensor_name: hasMic ? "Microphone" : (hasCamera ? "Camera" : (hasGps ? "GPS" : (hasBle ? "Bluetooth_Scan" : "Accelerometer"))),
                      app_state: isBg ? "BACKGROUND" : "FOREGROUND",
                      screen_state: isScreenOff ? "OFF" : "ON",
                      polling_rate_hz: 0,
                      enabled_accessibility_services: hasAccess ? ["Suspicious Accessibility Service Active"] : []
                    };
                  }

                  return (
                    <div className="grid grid-cols-2 gap-y-3">
                      <span className="text-gray-500">AUDITED SENSOR:</span>
                      <span className="text-white font-bold">{telemetry.sensor_name}</span>

                      <span className="text-gray-500">PHYSICAL SCREEN:</span>
                      <span className={telemetry.screen_state === 'OFF' ? 'text-red-400 font-bold' : 'text-gray-300'}>
                        {telemetry.screen_state}
                      </span>

                      <span className="text-gray-500">PROCESS PRIORITY:</span>
                      <span className={telemetry.app_state === 'BACKGROUND' ? 'text-red-400 font-bold' : 'text-gray-300'}>
                        {telemetry.app_state}
                      </span>

                      <span className="text-gray-500">POLLING FREQUENCY:</span>
                      <span className="text-gray-300">{telemetry.polling_rate_hz} Hz</span>

                      <span className="text-gray-500 block self-start">ACCESSIBILITY THREATS:</span>
                      <span className="text-gray-400 font-sans block self-start">
                        {Array.isArray(telemetry.enabled_accessibility_services) && telemetry.enabled_accessibility_services.length > 0 ? (
                          <ul className="list-disc list-inside text-red-400 text-[0.625rem] space-y-1 leading-normal">
                            {telemetry.enabled_accessibility_services.map((srv, idx) => (
                              <li key={idx} className="truncate max-w-48">{srv.split('/').pop()}</li>
                            ))}
                          </ul>
                        ) : 'None'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* HEADING 3: ACADEMIC SIGNIFICANCE */}
            <div className="space-y-4 border-t border-white/[0.03] pt-6">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-l-2 border-cyan-400 pl-2">
                3. Academic Significance
              </h4>
              <div className="space-y-4">
                {(() => {
                  const rules = Array.isArray(selectedThreat.triggered_rules) 
                    ? selectedThreat.triggered_rules 
                    : JSON.parse(selectedThreat.triggered_rules || '[]');
                  
                  return rules.map((rule, idx) => {
                    const mapping = ACADEMIC_DESCRIPTIONS[rule.id];
                    if (!mapping) return null;
                    return (
                      <div key={idx} className="bg-cyan-500/5 border border-cyan-500/10 rounded-2xl p-5 text-xs space-y-2.5">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-cyan-400 tracking-wide">{mapping.title}</span>
                          {mapping.mitre !== 'N/A' && (
                            <a 
                              href={`https://attack.mitre.org/techniques/${mapping.mitre}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[0.625rem] bg-cyan-500/10 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/20 hover:bg-cyan-500/20 transition-all font-semibold"
                            >
                              MITRE {mapping.mitre}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-gray-400 leading-relaxed text-[0.6875rem] font-sans">
                          {mapping.desc}
                        </p>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm space-y-2">
            <Database className="w-8 h-8 opacity-50" />
            <p>Select a threat alert to generate forensic breakdown.</p>
          </div>
        )}
      </div>

      {/* Drawer Overlay backdrop */}
      {drawerOpen && (
        <div 
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
        />
      )}
    </>
  );
}
