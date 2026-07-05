import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  Database, 
  Cpu, 
  Volume2, 
  Camera, 
  MapPin, 
  Wifi, 
  Smartphone, 
  ExternalLink,
  ChevronRight,
  Clock,
  Battery
} from 'lucide-react';

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

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [onlineSessions, setOnlineSessions] = useState(new Set());
  
  // Session Metrics
  const [kpis, setKpis] = useState({ max_score: 0, total_threats: 0, total_events: 0 });
  const [threats, setThreats] = useState([]);
  const [selectedThreat, setSelectedThreat] = useState(null);
  
  // Live log stream
  const [liveLogs, setLiveLogs] = useState([]);
  const liveLogsContainerRef = useRef(null);

  // WebSocket broker reference
  const wsBroker = useRef(null);

  // 1. Fetch Sessions List
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !selectedSession) {
          selectSession(data[0]);
        }
      }
    } catch (err) {
      console.error('[!] Error fetching sessions:', err);
    }
  };

  // 2. Fetch Details for Selected Session
  const selectSession = async (session) => {
    setSelectedSession(session);
    setSelectedThreat(null);
    try {
      // Fetch KPIs
      const statsRes = await fetch(`/api/sessions/${session.id}/stats`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setKpis(stats);
      }
      // Fetch Threats Grid
      const threatsRes = await fetch(`/api/sessions/${session.id}/threats`);
      if (threatsRes.ok) {
        const threatData = await threatsRes.json();
        setThreats(threatData);
        if (threatData.length > 0) {
          setSelectedThreat(threatData[0]);
        }
      }
    } catch (err) {
      console.error('[!] Error loading session details:', err);
    }
  };

  // 3. Setup WebSocket connection
  useEffect(() => {
    fetchSessions();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('[*] Initializing WebSocket broker client at:', wsUrl);
    wsBroker.current = new WebSocket(wsUrl);

    wsBroker.current.onopen = () => {
      addLiveLog('System', 'Connected to secure live analytics feed.', 'info');
    };

    wsBroker.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.event_type === "security_alert") {
          const alert = data.payload;
          
          addLiveLog(
            alert.threat_level, 
            `Security Warning: "${alert.app_package}" triggered Score: ${alert.score} [${alert.threat_level}]`
          );

          // If current session matches, refresh metrics
          if (selectedSession && selectedSession.id === alert.session_id) {
            selectSession(selectedSession);
          }
        } 
        
        else if (data.event_type === "active_sessions_sync") {
          setOnlineSessions(new Set(data.sessions));
          fetchSessions();
        }
      } catch (e) {
        console.error('[!] Socket message parse error:', e);
      }
    };

    wsBroker.current.onclose = () => {
      addLiveLog('System', 'Connection to broker closed. Retrying in 5 seconds...', 'warning');
      setTimeout(() => {
        // Simple page-level reconnect
        window.location.reload();
      }, 5000);
    };

    return () => {
      if (wsBroker.current) wsBroker.current.close();
    };
  }, [selectedSession?.id]);

  // Helper to append logs to console panel
  const addLiveLog = (tag, message, type = '') => {
    const time = new Date().toLocaleTimeString();
    setLiveLogs(prev => [...prev.slice(-100), { time, tag, message, type }]);
  };

  // Scroll live console to bottom on change
  useEffect(() => {
    if (liveLogsContainerRef.current) {
      liveLogsContainerRef.current.scrollTop = liveLogsContainerRef.current.scrollHeight;
    }
  }, [liveLogs]);

  // Color helper for threat levels
  const getThreatColorClass = (level) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'SUSPICIOUS': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090a0f] text-[#f3f4f6]">
      {/* Background Glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* SIDEBAR: SESSIONS LIST */}
      <div className="w-[340px] border-r border-white/5 bg-[#0a0b14]/95 flex flex-col z-10 flex-shrink-0">
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
              <Shield className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-outfit font-bold text-lg bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Hybrid Monitor
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wider uppercase font-semibold">Threat Analytics Platform</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sessions.map(session => {
            const isOnline = onlineSessions.has(session.id);
            const isActive = selectedSession?.id === session.id;
            return (
              <div
                key={session.id}
                onClick={() => selectSession(session)}
                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                  isActive 
                    ? 'bg-cyan-500/5 border-cyan-500/40 shadow-[0_4px_20px_rgba(6,182,212,0.05)]' 
                    : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-semibold text-sm truncate max-w-[150px]">
                      {session.device_id.replace(/_/g, ' ')}
                    </h3>
                  </div>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded font-mono text-gray-400">ID: {session.id}</span>
                </div>
                <p className="text-xs text-gray-400">OS: Android {session.os_version || 'N/A'} (API {session.api_level || 'N/A'})</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.03]">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-gray-500'}`} />
                    <span className="text-[10px] text-gray-400 font-medium">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-medium">{new Date(session.connected_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
        {/* HEADER */}
        <header className="px-8 py-5 border-b border-white/5 bg-[#090a0f]/50 backdrop-blur-md flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 font-outfit">
              {selectedSession ? `📱 ${selectedSession.device_id.replace(/_/g, ' ')} [Session #${selectedSession.id}]` : 'No Device Selected'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {selectedSession 
                ? `Android ${selectedSession.os_version} (API Level ${selectedSession.api_level}) | Network SSID: ${selectedSession.ssid || 'Cellular'}`
                : 'Select an active device session to begin data audits'}
            </p>
          </div>
          {selectedSession && (
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider ${
              onlineSessions.has(selectedSession.id) 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}>
              <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
              {onlineSessions.has(selectedSession.id) ? 'Online' : 'Offline'}
            </div>
          )}
        </header>

        {/* WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* KPI SCORECARDS */}
          <div className="grid grid-cols-4 gap-5">
            <div className="bg-[#121420]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Max Threat Score</p>
              <h3 className="text-3xl font-bold font-outfit text-red-500 text-shadow-red">{kpis.max_score || 0}</h3>
              <p className="text-xs text-gray-500 mt-2">Highest observed risk rating</p>
            </div>
            
            <div className="bg-[#121420]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-cyan-500" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Security Alarms</p>
              <h3 className="text-3xl font-bold font-outfit text-cyan-400">{kpis.total_threats || 0}</h3>
              <p className="text-xs text-gray-500 mt-2">Non-benign violations logged</p>
            </div>

            <div className="bg-[#121420]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Telemetry Events</p>
              <h3 className="text-3xl font-bold font-outfit text-purple-400">{kpis.total_events || 0}</h3>
              <p className="text-xs text-gray-500 mt-2">Total hardware packets audited</p>
            </div>

            <div className="bg-[#121420]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-yellow-500" />
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">Power Saving</p>
              <h3 className="text-3xl font-bold font-outfit text-yellow-400 flex items-center gap-2">
                <Battery className="w-6 h-6" />
                {selectedSession?.battery_saver_active ? 'ACTIVE' : 'INACTIVE'}
              </h3>
              <p className="text-xs text-gray-500 mt-2">Dormant battery throttling status</p>
            </div>
          </div>

          {/* MAIN THREAT DETECTOR GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* THREATS TABLE (8 Columns) */}
            <div className="lg:col-span-7 bg-[#121420]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col h-[520px]">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                <h3 className="font-bold font-outfit text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Analyzed Threat Detections
                </h3>
                <span className="text-xs text-gray-400">{threats.length} Alerts Logged</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {threats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
                    <Database className="w-8 h-8 opacity-50" />
                    <p className="text-sm">No threat alerts logged for this session.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-400 border-b border-white/5 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-3">Time</th>
                        <th className="py-3 px-3">Target App</th>
                        <th className="py-3 px-3">Severity</th>
                        <th className="py-3 px-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {threats.map(alert => {
                        const isSelected = selectedThreat?.id === alert.id;
                        return (
                          <tr 
                            key={alert.id}
                            onClick={() => setSelectedThreat(alert)}
                            className={`hover:bg-white/[0.02] cursor-pointer transition-colors duration-200 ${
                              isSelected ? 'bg-cyan-500/5 text-cyan-400 font-semibold' : ''
                            }`}
                          >
                            <td className="py-3.5 px-3 whitespace-nowrap font-medium font-mono text-[11px]">
                              {new Date(alert.timestamp || alert.connected_at).toLocaleTimeString()}
                            </td>
                            <td className="py-3.5 px-3 max-w-[180px] truncate">{alert.app_package}</td>
                            <td className="py-3.5 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${getThreatColorClass(alert.threat_level)}`}>
                                {alert.threat_level}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-semibold font-mono text-cyan-400">
                              {alert.score} pts
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* SUPERVISOR THREAT DEEP-DIVE MODAL/CARD (5 Columns) */}
            <div className="lg:col-span-5 bg-[#121420]/80 border border-cyan-500/20 rounded-2xl p-6 shadow-[0_10px_30px_rgba(6,182,212,0.05)] backdrop-blur-md h-[520px] flex flex-col overflow-hidden">
              <div className="border-b border-white/5 pb-3 mb-4">
                <h3 className="font-bold font-outfit text-base text-cyan-400 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Forensic Incident Report
                </h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Supervisor Audit Panel</p>
              </div>

              {selectedThreat ? (
                <div className="flex-1 overflow-y-auto space-y-6 pr-1">
                  
                  {/* HEADING 1: METRIC COMPONENT */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-l-2 border-cyan-400 pl-2">
                      1. Metric Component (MC)
                    </h4>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Target App/Package:</span>
                        <span className="font-semibold text-right max-w-[200px] truncate">{selectedThreat.app_package}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Assigned Threat Level:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getThreatColorClass(selectedThreat.threat_level)}`}>
                          {selectedThreat.threat_level}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Risk Score:</span>
                        <span className="font-bold text-cyan-400">{selectedThreat.score} points</span>
                      </div>
                      
                      {/* Sub-score indicator (Behavioural breakdown) */}
                      <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                        <span className="text-gray-400 text-[10px] font-semibold uppercase block">Behavioural Sub-score indicators:</span>
                        {(() => {
                          const rules = Array.isArray(selectedThreat.triggered_rules) 
                            ? selectedThreat.triggered_rules 
                            : JSON.parse(selectedThreat.triggered_rules || '[]');
                          return rules.map((rule, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-white/[0.02]">
                              <span className="text-[11px] text-gray-300">
                                <strong>{rule.tactic}:</strong> {rule.description}
                              </span>
                              <span className="font-mono text-cyan-400 font-bold ml-2">+{rule.points}</span>
                            </div>
                          ));
                        })()}
                        {(() => {
                          const modifiers = Array.isArray(selectedThreat.modifiers) 
                            ? selectedThreat.modifiers 
                            : JSON.parse(selectedThreat.modifiers || '[]');
                          return modifiers.map((mod, idx) => (
                            <div key={idx} className="text-[10px] text-emerald-400 italic mt-1 pl-1">
                              🛡️ Exemption Applied: {mod}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* HEADING 2: VALUE / OBSERVED TELEMETRY */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-l-2 border-cyan-400 pl-2">
                      2. Value / Observed Telemetry
                    </h4>
                    <div className="bg-[#05060a]/90 border border-white/5 rounded-xl p-4 font-mono text-[11px] text-cyan-400/90 leading-relaxed">
                      {(() => {
                        // Fallback observed telemetry constructor if column was null in database
                        let telemetry = selectedThreat.observed_telemetry;
                        if (typeof telemetry === 'string') {
                          try { telemetry = JSON.parse(telemetry); } catch(e) {}
                        }
                        if (!telemetry) {
                          // Derived telemetry from triggered rules
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
                          <div className="grid grid-cols-2 gap-y-2">
                            <span className="text-gray-500">AUDITED SENSOR:</span>
                            <span className="text-white font-bold">{telemetry.sensor_name}</span>

                            <span className="text-gray-500">SCREEN STATE:</span>
                            <span className={telemetry.screen_state === 'OFF' ? 'text-red-400 font-bold' : 'text-gray-300'}>
                              {telemetry.screen_state}
                            </span>

                            <span className="text-gray-500">PROCESS STATE:</span>
                            <span className={telemetry.app_state === 'BACKGROUND' ? 'text-red-400 font-bold' : 'text-gray-300'}>
                              {telemetry.app_state}
                            </span>

                            <span className="text-gray-500">POLLING FREQ:</span>
                            <span className="text-gray-300">{telemetry.polling_rate_hz} Hz</span>

                            <span className="text-gray-500 block self-start">ACCESSIBILITY WARNINGS:</span>
                            <span className="text-gray-400 font-sans block self-start">
                              {telemetry.enabled_accessibility_services && telemetry.enabled_accessibility_services.length > 0 ? (
                                <ul className="list-disc list-inside text-red-400 text-[10px] space-y-0.5">
                                  {telemetry.enabled_accessibility_services.map((srv, idx) => (
                                    <li key={idx} className="truncate max-w-[160px]">{srv.split('/').pop()}</li>
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
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-l-2 border-cyan-400 pl-2">
                      3. Academic Significance
                    </h4>
                    <div className="space-y-3">
                      {(() => {
                        const rules = Array.isArray(selectedThreat.triggered_rules) 
                          ? selectedThreat.triggered_rules 
                          : JSON.parse(selectedThreat.triggered_rules || '[]');
                        
                        return rules.map((rule, idx) => {
                          const mapping = ACADEMIC_DESCRIPTIONS[rule.id];
                          if (!mapping) return null;
                          return (
                            <div key={idx} className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4 text-xs space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-cyan-400">{mapping.title}</span>
                                {mapping.mitre !== 'N/A' && (
                                  <a 
                                    href={`https://attack.mitre.org/techniques/${mapping.mitre}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/20 hover:bg-cyan-500/20"
                                  >
                                    MITRE {mapping.mitre}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                              <p className="text-gray-400 leading-relaxed text-[11px] font-sans">
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

          </div>

          {/* DYNAMIC REAL-TIME CONSOLE STREAM */}
          <div className="bg-[#121420]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col h-[280px]">
            <h3 className="font-bold font-outfit text-base mb-4 pb-3 border-b border-white/5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Sensor Telemetry Stream
            </h3>
            
            <div 
              ref={liveLogsContainerRef}
              className="flex-1 bg-[#05060a]/90 border border-white/5 rounded-xl p-4 overflow-y-auto font-mono text-xs text-emerald-400 space-y-1.5"
            >
              {liveLogs.length === 0 ? (
                <div className="text-gray-500 italic">[System] Awaiting live telemetry frames...</div>
              ) : (
                liveLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2.5 leading-relaxed items-start">
                    <span className="text-gray-500 flex-shrink-0">[{log.time}]</span>
                    <span className={`font-bold flex-shrink-0 ${
                      log.tag === 'CRITICAL' ? 'text-red-500' :
                      log.tag === 'HIGH' ? 'text-orange-500' :
                      log.tag === 'SUSPICIOUS' ? 'text-yellow-500' :
                      log.tag === 'System' ? 'text-gray-500' : 'text-emerald-400'
                    }`}>
                      [{log.tag}]
                    </span>
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
