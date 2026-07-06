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
  Battery,
  X,
  Terminal,
  Grid,
  Settings
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
  
  // Navigation / Tabs State
  const [activeTab, setActiveTab] = useState('threats'); // 'threats', 'live', 'sessions'
  
  // Session Metrics
  const [kpis, setKpis] = useState({ max_score: 0, total_threats: 0, total_events: 0 });
  const [threats, setThreats] = useState([]);
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
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
    setDrawerOpen(false);
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
    setLiveLogs(prev => [...prev.slice(-150), { time, tag, message, type }]);
  };

  // Scroll live console to bottom on change
  useEffect(() => {
    if (liveLogsContainerRef.current) {
      liveLogsContainerRef.current.scrollTop = liveLogsContainerRef.current.scrollHeight;
    }
  }, [liveLogs, activeTab]);

  // Color helper for threat levels
  const getThreatColorClass = (level) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'SUSPICIOUS': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    }
  };

  const handleThreatClick = (threat) => {
    setSelectedThreat(threat);
    setDrawerOpen(true);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07080d] text-[#f3f4f6] font-sans antialiased">
      {/* Background Glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[160px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[160px] pointer-events-none z-0" />

      {/* SIDEBAR: SESSIONS / DEVICES */}
      <div className="w-[300px] border-r border-white/5 bg-[#0a0b14]/90 flex flex-col z-10 flex-shrink-0">
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Shield className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-outfit font-extrabold text-base bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-wide">
                HYBRID MONITOR
              </h1>
              <p className="text-[9px] text-gray-500 tracking-wider uppercase font-semibold">Forensic Threat Auditing</p>
            </div>
          </div>
        </div>

        {/* Device Sessions Sub-list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-2 mb-2">Connected Devices</div>
          {sessions.map(session => {
            const isOnline = onlineSessions.has(session.id);
            const isActive = selectedSession?.id === session.id;
            return (
              <div
                key={session.id}
                onClick={() => selectSession(session)}
                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                  isActive 
                    ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.05)]' 
                    : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-semibold text-xs truncate max-w-[140px]">
                      {session.device_id.replace(/_/g, ' ')}
                    </h3>
                  </div>
                  <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded font-mono text-gray-400">#{session.id}</span>
                </div>
                <p className="text-[11px] text-gray-400">Android {session.os_version || 'N/A'} (API {session.api_level || 'N/A'})</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.03]">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-gray-500'}`} />
                    <span className="text-[9px] text-gray-400 font-medium">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </div>
                  <span className="text-[9px] text-gray-500">{new Date(session.connected_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
        
        {/* HEADER BAR */}
        <header className="px-8 py-5 border-b border-white/5 bg-[#07080d]/60 backdrop-blur-md flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 font-outfit">
              {selectedSession ? `📱 ${selectedSession.device_id.replace(/_/g, ' ')}` : 'No Device Selected'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedSession 
                ? `Android ${selectedSession.os_version} (API ${selectedSession.api_level}) | Network SSID: ${selectedSession.ssid || 'Cellular'}`
                : 'Select an active device session to begin data audits'}
            </p>
          </div>

          {/* TAB NAVIGATION */}
          <div className="flex bg-white/[0.02] border border-white/5 rounded-xl p-1 gap-1">
            <button
              onClick={() => setActiveTab('threats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'threats' 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Threat Center
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'live' 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Terminal className="w-4 h-4" />
              Live Console
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'sessions' 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Grid className="w-4 h-4" />
              Device Details
            </button>
          </div>
        </header>

        {/* WORKSPACE CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          
          {/* TAB 1: THREATS CENTER */}
          {activeTab === 'threats' && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* KPI CARD STATS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500" />
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Max Risk Rating</p>
                  <h3 className="text-3xl font-bold font-outfit text-red-500 font-mono">{kpis.max_score || 0} <span className="text-xs text-gray-600">PTS</span></h3>
                  <p className="text-xs text-gray-500 mt-2">Highest alert severity recorded</p>
                </div>
                
                <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Threat Alarms</p>
                  <h3 className="text-3xl font-bold font-outfit text-orange-400 font-mono">{kpis.total_threats || 0}</h3>
                  <p className="text-xs text-gray-500 mt-2">Identified non-benign patterns</p>
                </div>

                <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-cyan-500" />
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Total Packets</p>
                  <h3 className="text-3xl font-bold font-outfit text-cyan-400 font-mono">{kpis.total_events || 0}</h3>
                  <p className="text-xs text-gray-500 mt-2">Physical sensor updates processed</p>
                </div>

                <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-yellow-500" />
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Power Optimization</p>
                  <h3 className="text-3xl font-bold font-outfit text-yellow-400 flex items-center gap-2 font-mono">
                    <Battery className="w-6 h-6 animate-pulse" />
                    {selectedSession?.battery_saver_active ? 'ACTIVE' : 'INACTIVE'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-2">Battery saver throttling status</p>
                </div>
              </div>

              {/* THREAT ALERTS TABLES (Full Width for spaciousness) */}
              <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md flex flex-col">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                  <div>
                    <h3 className="font-extrabold font-outfit text-lg flex items-center gap-2 text-white">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      Analyzed Threat Telemetry
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">Click any record row to open full-scale forensic breakdown drawer</p>
                  </div>
                  <span className="text-xs bg-white/5 border border-white/10 px-3 py-1 rounded-full text-gray-400 font-semibold">{threats.length} Events Logged</span>
                </div>

                <div className="overflow-x-auto">
                  {threats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-3">
                      <Database className="w-12 h-12 opacity-30" />
                      <p className="text-sm">No threat events recorded for this session.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-gray-400 border-b border-white/5 uppercase text-[10px] tracking-widest font-bold">
                          <th className="py-4 px-4">Audit Timestamp</th>
                          <th className="py-4 px-4">Target Application Package</th>
                          <th className="py-4 px-4">Assigned Severity</th>
                          <th className="py-4 px-4 text-right">Risk Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02]">
                        {threats.map(alert => {
                          const isSelected = selectedThreat?.id === alert.id;
                          return (
                            <tr 
                              key={alert.id}
                              onClick={() => handleThreatClick(alert)}
                              className={`hover:bg-cyan-500/[0.03] hover:text-white cursor-pointer transition-all duration-200 ${
                                isSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold border-l-2 border-cyan-500' : ''
                              }`}
                            >
                              <td className="py-4.5 px-4 whitespace-nowrap font-mono text-[11px] text-gray-400">
                                {new Date(alert.timestamp || alert.connected_at).toLocaleString()}
                              </td>
                              <td className="py-4.5 px-4 font-semibold text-gray-300">{alert.app_package}</td>
                              <td className="py-4.5 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[9px] font-extrabold uppercase tracking-wide ${getThreatColorClass(alert.threat_level)}`}>
                                  {alert.threat_level}
                                </span>
                              </td>
                              <td className="py-4.5 px-4 text-right font-extrabold font-mono text-cyan-400 text-sm">
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
            </div>
          )}

          {/* TAB 2: LIVE LOG CONSOLE */}
          {activeTab === 'live' && (
            <div className="bg-[#05060b] border border-white/5 rounded-2xl p-6 backdrop-blur-md h-[calc(100vh-210px)] flex flex-col overflow-hidden animate-fadeIn">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="font-extrabold font-outfit text-base text-white">Live System Logs</h3>
                </div>
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">ws_broker_active</span>
              </div>
              
              <div 
                ref={liveLogsContainerRef}
                className="flex-1 bg-black/40 border border-white/5 rounded-xl p-6 overflow-y-auto font-mono text-xs text-emerald-400 space-y-2"
              >
                {liveLogs.length === 0 ? (
                  <div className="text-gray-500 italic">[System] Awaiting device socket telemetry streams...</div>
                ) : (
                  liveLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-3 leading-relaxed items-start">
                      <span className="text-gray-600 flex-shrink-0">[{log.time}]</span>
                      <span className={`font-extrabold flex-shrink-0 ${
                        log.tag === 'CRITICAL' ? 'text-red-500' :
                        log.tag === 'HIGH' ? 'text-orange-500' :
                        log.tag === 'SUSPICIOUS' ? 'text-yellow-500' :
                        log.tag === 'System' ? 'text-cyan-400' : 'text-emerald-400'
                      }`}>
                        [{log.tag}]
                      </span>
                      <span className="text-gray-300">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SESSIONS / DEVICE DETAILS */}
          {activeTab === 'sessions' && selectedSession && (
            <div className="space-y-6 animate-fadeIn max-w-4xl mx-auto">
              <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md space-y-6">
                <div className="border-b border-white/5 pb-4">
                  <h3 className="text-lg font-bold font-outfit text-white">Device Audit Registry</h3>
                  <p className="text-xs text-gray-400 mt-1">Detailed hardware and environment configurations captured during registration</p>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs font-mono">
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">DATABASE SESSION ID</span>
                    <span className="text-white font-semibold">#{selectedSession.id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">DEVICE HARDWARE ID</span>
                    <span className="text-white font-semibold">{selectedSession.device_id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">ANDROID VERSION</span>
                    <span className="text-white font-semibold">Android {selectedSession.os_version || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">API BUILD LEVEL</span>
                    <span className="text-white font-semibold">SDK {selectedSession.api_level || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">SSID (CONNECTION)</span>
                    <span className="text-white font-semibold">{selectedSession.ssid || 'Cellular Data'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">IP ADDRESS</span>
                    <span className="text-white font-semibold">{selectedSession.ip_address || '127.0.0.1'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">CONNECTION TYPE</span>
                    <span className="text-white font-semibold uppercase">{selectedSession.connection_type || 'WiFi'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/[0.03]">
                    <span className="text-gray-500">REGISTRATION DATE</span>
                    <span className="text-white font-semibold">{new Date(selectedSession.connected_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* SLIDE-OVER FORENSIC Incident Drawer (SPACIOUS DRAWER) */}
      <div 
        className={`fixed inset-y-0 right-0 w-[580px] bg-[#0c0d17]/95 border-l border-cyan-500/20 shadow-[-10px_0_30px_rgba(0,0,0,0.8)] z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div>
            <h3 className="font-bold font-outfit text-base text-cyan-400 flex items-center gap-2">
              <Activity className="w-5 h-5 animate-pulse" />
              Forensic Incident Report
            </h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Auditing Security Telemetry</p>
          </div>
          <button 
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {selectedThreat ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* HEADING 1: METRIC COMPONENT */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-l-2 border-cyan-400 pl-2">
                1. Metric Component (MC)
              </h4>
              <div className="bg-[#11121d] border border-white/5 rounded-2xl p-5 space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-400">Target Application Package:</span>
                  <span className="font-semibold text-white max-w-[240px] truncate">{selectedThreat.app_package}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Assigned Threat Level:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${getThreatColorClass(selectedThreat.threat_level)}`}>
                    {selectedThreat.threat_level}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-white/[0.03]">
                  <span className="text-gray-400">Cumulative Risk Score:</span>
                  <span className="font-extrabold text-cyan-400 font-mono text-sm">{selectedThreat.score} points</span>
                </div>
                
                {/* Behavioural Sub-score indicators */}
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  <span className="text-gray-400 text-[10px] font-extrabold uppercase tracking-wider block">Behavioural Sub-score Indicators:</span>
                  <div className="space-y-2">
                    {(() => {
                      const rules = Array.isArray(selectedThreat.triggered_rules) 
                        ? selectedThreat.triggered_rules 
                        : JSON.parse(selectedThreat.triggered_rules || '[]');
                      return rules.map((rule, idx) => (
                        <div key={idx} className="flex justify-between items-start bg-white/[0.02] px-3.5 py-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                          <div>
                            <span className="text-[10px] text-cyan-500 font-bold uppercase block">{rule.tactic}</span>
                            <span className="text-[11px] text-gray-300 mt-0.5 block">{rule.description}</span>
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
                        <div key={idx} className="text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
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
              <div className="bg-[#05060b] border border-white/5 rounded-2xl p-5 font-mono text-[11px] text-cyan-400/90 leading-relaxed space-y-3">
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
                        {telemetry.enabled_accessibility_services && telemetry.enabled_accessibility_services.length > 0 ? (
                          <ul className="list-disc list-inside text-red-400 text-[10px] space-y-1 leading-normal">
                            {telemetry.enabled_accessibility_services.map((srv, idx) => (
                              <li key={idx} className="truncate max-w-[200px]">{srv.split('/').pop()}</li>
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
                              className="inline-flex items-center gap-1.5 text-[10px] bg-cyan-500/10 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/20 hover:bg-cyan-500/20 transition-all font-semibold"
                            >
                              MITRE {mapping.mitre}
                              <ExternalLink className="w-3 h-3" />
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

      {/* Drawer Overlay backdrop */}
      {drawerOpen && (
        <div 
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
        />
      )}

    </div>
  );
}
