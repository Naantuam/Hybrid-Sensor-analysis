import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Smartphone, 
  Activity, 
  PlusCircle,
  LayoutDashboard
} from 'lucide-react';
import SystemDashboard from './components/SystemDashboard';
import DeviceDashboard from './components/DeviceDashboard';
import OnboardingModal from './components/OnboardingModal';
import ThreatDrawer from './components/ThreatDrawer';

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [onlineSessions, setOnlineSessions] = useState(new Set());
  
  // Navigation / Views State
  const [currentView, setCurrentView] = useState('overview'); // 'overview', 'device'
  
  // Onboarding Modal state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  
  // Session Metrics
  const [kpis, setKpis] = useState({ max_score: 0, total_threats: 0, total_events: 0 });
  const [threats, setThreats] = useState([]);
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Live log stream
  const [liveLogs, setLiveLogs] = useState([]);

  // WebSocket broker reference
  const wsBroker = useRef(null);
  const selectedSessionRef = useRef(null);

  // Mobile Sidebar Toggle State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Keep selectedSessionRef updated with the latest state
  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  // 1. Fetch Sessions List
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        // If there is an active selected session, keep it, otherwise do not force selection
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
    setIsMobileSidebarOpen(false); // Close mobile drawer on selection
    setCurrentView('device');   // Automatically route to the device details page
    try {
      const statsRes = await fetch(`/api/sessions/${session.id}/stats`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setKpis(stats);
      }
      const threatsRes = await fetch(`/api/sessions/${session.id}/threats`);
      if (threatsRes.ok) {
        const threatData = await threatsRes.json();
        setThreats(threatData);
      }
    } catch (err) {
      console.error('[!] Error loading session details:', err);
    }
  };

  // 2b. Refresh details silently without resetting UI selection or drawer states
  const refreshSessionData = async (sessionId) => {
    try {
      const statsRes = await fetch(`/api/sessions/${sessionId}/stats`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setKpis(stats);
      }
      const threatsRes = await fetch(`/api/sessions/${sessionId}/threats`);
      if (threatsRes.ok) {
        const threatData = await threatsRes.json();
        setThreats(threatData);
      }
    } catch (err) {
      console.error('[!] Error refreshing session details:', err);
    }
  };

  // 3. Setup WebSocket connection
  useEffect(() => {
    fetchSessions();

    let reconnectTimeout = null;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' ? `${window.location.hostname}:4444` : window.location.host;
      const wsUrl = `${protocol}//${host}`;
      
      const ws = new WebSocket(wsUrl);
      wsBroker.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event_type === "security_alert") {
            const alert = data.payload;
            const devName = alert.device_id ? alert.device_id.replace(/_/g, ' ') : `Session #${alert.session_id}`;
            addLiveLog(alert.threat_level, `${devName}: "${alert.app_package}" triggered Score: ${alert.score}`);
            const currentSelected = selectedSessionRef.current;
            if (currentSelected && currentSelected.id === alert.session_id) {
              refreshSessionData(currentSelected.id);
            }
          } else if (data.event_type === "app_sensor_telemetry") {
            const telemetry = data.payload;
            const devName = data.metadata?.device_id ? data.metadata.device_id.replace(/_/g, ' ') : `Session #${data.metadata?.session_id}`;
            addLiveLog("INFO", `${devName}: "${telemetry.app_package}" accessed ${telemetry.sensor_name} (${telemetry.app_state})`);
            const currentSelected = selectedSessionRef.current;
            if (currentSelected && currentSelected.id === data.metadata.session_id) {
              refreshSessionData(currentSelected.id);
            }
          } else if (data.event_type === "active_sessions_sync") {
            setOnlineSessions(new Set(data.sessions));
            fetchSessions();
          }
        } catch (e) {
          console.error('[!] Socket message parse error:', e);
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      };
    };

    connectWebSocket();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsBroker.current) wsBroker.current.close();
    };
  }, []);

  const addLiveLog = (tag, message, type = '') => {
    const time = new Date().toLocaleTimeString();
    setLiveLogs(prev => [...prev.slice(-150), { time, tag, message, type }]);
  };

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
      {/* Background radial highlights */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 md:w-144 md:h-144 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 md:w-144 md:h-144 bg-purple-500/5 rounded-full blur-3xl pointer-events-none z-0" />

      {/* Mobile Drawer Overlay Backdrop */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-20 md:hidden"
        />
      )}

      {/* Sidebar navigation drawer */}
      <div className={`fixed md:relative inset-y-0 left-0 w-72 border-r border-white/5 bg-[#0a0b14]/90 flex flex-col z-30 transition-transform duration-300 transform md:translate-x-0 ${
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } flex-shrink-0`}>
        
        {/* Header containing the Plus registration button */}
        <div className="p-5 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Shield className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-outfit font-extrabold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-wide">
                HYBRID MONITOR
              </h1>
              <p className="text-[9px] text-gray-500 tracking-wider uppercase font-semibold">Forensic Threat Auditing</p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsOnboardingOpen(true);
              setIsMobileSidebarOpen(false);
            }}
            className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg transition-all cursor-pointer"
            title="Scan & Onboard Device"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        {/* System Dashboard Navigation */}
        <div className="p-4 border-b border-white/5">
          <button
            onClick={() => {
              setCurrentView('overview');
              setSelectedSession(null);
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
              currentView === 'overview' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' 
                : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            System Overview
          </button>
        </div>

        {/* Connected Devices List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest px-2 mb-2 font-outfit">Connected Devices</div>
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-xs italic">
              No devices registered.
            </div>
          ) : (
            sessions.map(session => {
              const isOnline = onlineSessions.has(session.id);
              const isActive = selectedSession?.id === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => selectSession(session)}
                  className={`p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                    isActive 
                      ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.05)]' 
                      : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      <h3 className="font-semibold text-xs truncate max-w-36">
                        {session.device_id.replace(/_/g, ' ')}
                      </h3>
                    </div>
                    <span className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded font-mono text-gray-400">#{session.id}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono">Android {session.os_version || 'N/A'} (API {session.api_level || 'N/A'})</p>
                  
                  <div className="flex flex-wrap gap-1 mt-2">
                    {session.connection_type === 'usb_adb' && (
                      <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400 bg-cyan-500/10">USB BRIDGE</span>
                    )}
                    {session.connection_type === 'wireless_adb' && (
                      <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded-full border border-sky-500/30 text-sky-400 bg-sky-500/10">WIRELESS ADB</span>
                    )}
                    {session.connection_type === 'local_termux' && (
                      <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">LOCAL WI-FI</span>
                    )}
                    {session.connection_type === 'cloud_internet' && (
                      <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded-full border border-purple-500/30 text-purple-400 bg-purple-500/10">CLOUD INTERNET</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.03]">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-gray-500'}`} />
                      <span className="text-[9px] text-gray-400 font-medium">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                    <span className="text-[9px] text-gray-500 font-mono">{new Date(session.connected_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main workspace display area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
        {currentView === 'overview' ? (
          <SystemDashboard
            handleThreatClick={handleThreatClick}
            getThreatColorClass={getThreatColorClass}
            liveLogs={liveLogs}
            sessions={sessions}
          />
        ) : (
          <DeviceDashboard
            selectedSession={selectedSession}
            kpis={kpis}
            threats={threats}
            selectedThreat={selectedThreat}
            handleThreatClick={handleThreatClick}
            liveLogs={liveLogs}
            getThreatColorClass={getThreatColorClass}
            toggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          />
        )}
      </div>

      {/* Threat detailed forensic drawer */}
      <ThreatDrawer
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        selectedThreat={selectedThreat}
        getThreatColorClass={getThreatColorClass}
        selectedSession={selectedSession}
      />

      {/* Onboarding Dialog Overlay */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onRegisterSuccess={fetchSessions}
      />
    </div>
  );
}
