import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Smartphone, 
  Activity, 
  PlusCircle
} from 'lucide-react';
import DeviceRegister from './components/DeviceRegister';
import ThreatMonitor from './components/ThreatMonitor';
import ThreatDrawer from './components/ThreatDrawer';

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [onlineSessions, setOnlineSessions] = useState(new Set());
  
  // Navigation / Views State
  const [currentView, setCurrentView] = useState('onboarding'); // 'telemetry', 'onboarding'
  
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
        if (data.length > 0 && !selectedSessionRef.current) {
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
    setIsMobileSidebarOpen(false); // Close mobile drawer on selection
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
            addLiveLog(alert.threat_level, `Security Warning: "${alert.app_package}" triggered Score: ${alert.score}`);
            const currentSelected = selectedSessionRef.current;
            if (currentSelected && currentSelected.id === alert.session_id) {
              selectSession(currentSelected);
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
      {/* Background radial highlights using standard spacing/sizes */}
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
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Shield className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-outfit font-extrabold text-base bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-wide">
                HYBRID MONITOR
              </h1>
              <p className="text-[0.5625rem] text-gray-500 tracking-wider uppercase font-semibold">Forensic Threat Auditing</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-white/5 space-y-2">
          <button
            onClick={() => {
              setCurrentView('onboarding');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
              currentView === 'onboarding' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' 
                : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Onboarding & Devices
          </button>
          <button
            onClick={() => {
              setCurrentView('telemetry');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
              currentView === 'telemetry' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' 
                : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <Activity className="w-4 h-4" />
            Telemetry & Threats
          </button>
        </div>

        {currentView === 'telemetry' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-[0.625rem] text-gray-500 font-bold uppercase tracking-widest px-2 mb-2 font-outfit">Connected Devices</div>
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
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                      isActive 
                        ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.05)]' 
                        : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-cyan-400" />
                        <h3 className="font-semibold text-xs truncate max-w-36">
                          {session.device_id.replace(/_/g, ' ')}
                        </h3>
                      </div>
                      <span className="text-[0.5625rem] bg-white/5 px-2 py-0.5 rounded font-mono text-gray-400">#{session.id}</span>
                    </div>
                    <p className="text-[0.6875rem] text-gray-400 font-mono">Android {session.os_version || 'N/A'} (API {session.api_level || 'N/A'})</p>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.03]">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-gray-500'}`} />
                        <span className="text-[0.5625rem] text-gray-400 font-medium">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                      </div>
                      <span className="text-[0.5625rem] text-gray-500 font-mono">{new Date(session.connected_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
        {currentView === 'telemetry' ? (
          <ThreatMonitor
            selectedSession={selectedSession}
            kpis={kpis}
            threats={threats}
            selectedThreat={selectedThreat}
            handleThreatClick={handleThreatClick}
            liveLogs={liveLogs}
            getThreatColorClass={getThreatColorClass}
            toggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          />
        ) : (
          <DeviceRegister toggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)} />
        )}
      </div>

      <ThreatDrawer
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        selectedThreat={selectedThreat}
        getThreatColorClass={getThreatColorClass}
      />
    </div>
  );
}
