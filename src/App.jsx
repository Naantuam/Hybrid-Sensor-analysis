import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, 
  Smartphone, 
  Activity, 
  PlusCircle,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Fingerprint
} from 'lucide-react';
import SystemDashboard from './components/SystemDashboard';
import DeviceDashboard from './components/DeviceDashboard';
import OnboardingModal from './components/OnboardingModal';
import ThreatDrawer from './components/ThreatDrawer';
import FingerprintLogo from './components/FingerprintLogo';
import { getApiCache, setApiCache, invalidateApiCache } from './utils/apiCache';

export default function App() {
  const [sessions, setSessions] = useState(() => getApiCache('/api/sessions') || []);
  const [selectedSession, setSelectedSession] = useState(null);
  const [onlineSessions, setOnlineSessions] = useState(new Set());
  
  // Navigation / Views State
  const [currentView, setCurrentView] = useState('overview'); // 'overview', 'device'
  
  // Top loading state for smooth non-blocking transitions
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Onboarding Modal state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  
  // Session Metrics
  const [kpis, setKpis] = useState({ max_score: 0, total_threats: 0, total_events: 0 });
  const [threats, setThreats] = useState([]);
  const [rawEvents, setRawEvents] = useState([]);
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Live log stream
  const [liveLogs, setLiveLogs] = useState([]);

  // WebSocket broker reference
  const wsBroker = useRef(null);
  const selectedSessionRef = useRef(null);

  // Mobile & Collapsible Sidebar State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Master switch for ADB & Live Telemetry
  const [isAdbActive, setIsAdbActive] = useState(true);

  const toggleAdbServer = useCallback(async () => {
    try {
      const res = await fetch('/api/system/toggle-adb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !isAdbActive })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setIsAdbActive(data.adbActive);
      }
    } catch (err) {
      console.error('[!] Error toggling ADB server:', err);
    }
  }, [isAdbActive]);

  const toggleSidebar = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsMobileSidebarOpen(prev => !prev);
    } else {
      setIsSidebarCollapsed(prev => !prev);
    }
  }, []);

  // Keep selectedSessionRef updated with the latest state
  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  // 1. Fetch Sessions List with Cache-First Strategy
  const fetchSessions = useCallback(async () => {
    const cached = getApiCache('/api/sessions');
    if (cached) {
      setSessions(cached);
    }
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setApiCache('/api/sessions', data);
        setSessions(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (err) {
      console.error('[!] Error fetching sessions:', err);
    }
  }, []);

  // 2. Fetch Details for Selected Session with 0ms Instant Cache Restoration
  const selectSession = useCallback(async (session) => {
    setSelectedSession(session);
    setSelectedThreat(null);
    setDrawerOpen(false);
    setIsMobileSidebarOpen(false); // Close mobile drawer on selection
    setCurrentView('device');      // Automatically route to the device details page

    // 1. Check client cache immediately (0ms render)
    const cachedStats = getApiCache(`/api/sessions/${session.id}/stats`);
    const cachedThreats = getApiCache(`/api/sessions/${session.id}/threats`);
    const cachedEvents = getApiCache(`/api/sessions/${session.id}/events`);

    if (cachedStats) setKpis(cachedStats);
    if (cachedThreats) setThreats(cachedThreats);
    if (cachedEvents) setRawEvents(cachedEvents);

    const hasFullCache = cachedStats && cachedThreats && cachedEvents;
    if (!hasFullCache) {
      setIsDataLoading(true);
    }

    try {
      const [statsRes, threatsRes, eventsRes] = await Promise.all([
        fetch(`/api/sessions/${session.id}/stats`),
        fetch(`/api/sessions/${session.id}/threats`),
        fetch(`/api/sessions/${session.id}/events`)
      ]);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setApiCache(`/api/sessions/${session.id}/stats`, statsData);
        setKpis(statsData);
      }
      if (threatsRes.ok) {
        const threatsData = await threatsRes.json();
        setApiCache(`/api/sessions/${session.id}/threats`, threatsData);
        setThreats(threatsData);
      }
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setApiCache(`/api/sessions/${session.id}/events`, eventsData);
        setRawEvents(eventsData);
      }
    } catch (err) {
      console.error('[!] Error loading session details:', err);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  // 2b. Refresh details silently without resetting UI selection or drawer states
  const refreshSessionData = useCallback(async (sessionId) => {
    try {
      const [statsRes, threatsRes, eventsRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/stats`),
        fetch(`/api/sessions/${sessionId}/threats`),
        fetch(`/api/sessions/${sessionId}/events`)
      ]);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setApiCache(`/api/sessions/${sessionId}/stats`, statsData);
        setKpis(statsData);
      }
      if (threatsRes.ok) {
        const threatsData = await threatsRes.json();
        setApiCache(`/api/sessions/${sessionId}/threats`, threatsData);
        setThreats(threatsData);
      }
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setApiCache(`/api/sessions/${sessionId}/events`, eventsData);
        setRawEvents(eventsData);
      }
    } catch (err) {
      console.error('[!] Error refreshing session details:', err);
    }
  }, []);

  const addLiveLog = useCallback((tag, message, type = '') => {
    const time = new Date().toLocaleTimeString();
    setLiveLogs(prev => [...prev.slice(-150), { time, tag, message, type }]);
  }, []);

  // 3. Setup WebSocket connection & Auto-detect connected devices on reload
  useEffect(() => {
    fetchSessions();

    // Fetch initial ADB master switch status
    fetch('/api/system/adb-status')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setIsAdbActive(data.adbActive);
        }
      })
      .catch(() => {});
    
    // Initial auto-detect of connected ADB devices on page reload
    fetch('/api/usb-detect')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.devices && data.devices.length > 0) {
          const serials = data.devices.map(d => d.serial);
          setOnlineSessions(prev => new Set([...prev, ...serials]));
          fetchSessions();
        }
      })
      .catch(() => {});

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
            const devTag = data.metadata?.device_id || (selectedSessionRef.current ? selectedSessionRef.current.device_id : 'Device');
            addLiveLog(alert.threat_level, `[${devTag}] Security Warning: "${alert.app_package}" triggered Score: ${alert.score}`);
            
            // Invalidate cache on live security threat
            invalidateApiCache('/api/threats');
            invalidateApiCache('/api/stats');
            if (alert.session_id) {
              invalidateApiCache(`/api/sessions/${alert.session_id}`);
            }

            const currentSelected = selectedSessionRef.current;
            if (currentSelected && currentSelected.id === alert.session_id) {
              refreshSessionData(currentSelected.id);
            }
          } else if (data.event_type === "app_sensor_telemetry") {
            const telemetry = data.payload;
            const devTag = data.metadata?.device_id || (selectedSessionRef.current ? selectedSessionRef.current.device_id : 'Device');
            addLiveLog("INFO", `[${devTag}] Telemetry: "${telemetry.app_package}" accessed ${telemetry.sensor_name} (${telemetry.app_state})`);
            
            // Invalidate cache on live sensor telemetry
            invalidateApiCache('/api/events');
            invalidateApiCache('/api/stats');
            if (data.metadata?.session_id) {
              invalidateApiCache(`/api/sessions/${data.metadata.session_id}`);
            }

            const currentSelected = selectedSessionRef.current;
            if (currentSelected && currentSelected.id === data.metadata.session_id) {
              refreshSessionData(currentSelected.id);
            }
          } else if (data.event_type === "active_sessions_sync") {
            const incoming = data.sessions || [];
            setOnlineSessions(prev => {
              const prevArr = Array.from(prev);
              if (prevArr.length === incoming.length && incoming.every(s => prev.has(s))) {
                return prev;
              }
              invalidateApiCache('/api/sessions');
              fetchSessions();
              return new Set(incoming);
            });
          } else if (data.event_type === "active_adb_sync") {
            const incoming = data.serials || [];
            setOnlineSessions(prev => {
              const prevArr = Array.from(prev);
              if (prevArr.length === incoming.length && incoming.every(s => prev.has(s))) {
                return prev;
              }
              invalidateApiCache('/api/sessions');
              fetchSessions();
              return new Set(incoming);
            });
          } else if (data.event_type === "adb_status_change" || data.event_type === "adb_status_sync") {
            setIsAdbActive(prev => prev === data.adbActive ? prev : data.adbActive);
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
  }, [fetchSessions, refreshSessionData, addLiveLog]);

  const getThreatColorClass = useCallback((level) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'SUSPICIOUS': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    }
  }, []);

  const handleThreatClick = useCallback((threat) => {
    setSelectedThreat(threat);
    setDrawerOpen(true);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07080d] text-[#f3f4f6] font-sans antialiased relative">
      {/* Top Subtle Loading Progress Bar for Smooth Visual Transition */}
      {isDataLoading && (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-50 overflow-hidden bg-white/5 pointer-events-none">
          <div className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 animate-loading-bar" />
        </div>
      )}

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
      <div className={`fixed md:relative inset-y-0 left-0 bg-[#0a0b14]/95 backdrop-blur-xl border-r border-white/10 flex flex-col z-30 transition-all duration-300 ease-in-out flex-shrink-0 ${
        isMobileSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'
      } ${
        isSidebarCollapsed ? 'md:w-20' : 'md:w-72'
      }`}>
        
        {/* Header containing Fingerprint Logo & Rebranded Title */}
        <div className={`p-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent flex items-center justify-between min-h-[73px] ${
          isSidebarCollapsed ? 'md:justify-center md:px-2' : ''
        }`}>
          <FingerprintLogo 
            onClick={toggleSidebar}
            isCollapsed={isSidebarCollapsed}
            showLabel={!isSidebarCollapsed}
            title="FORENSIC SENSOR MONITOR"
            subtitle="Hybrid Intelligence Audit"
          />

          {!isSidebarCollapsed && (
            <button
              onClick={() => {
                setIsOnboardingOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              className={`p-2 rounded-xl transition-all cursor-pointer group ${
                isAdbActive
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] hover:scale-105 active:scale-95'
                  : 'bg-slate-800/40 hover:bg-slate-800/80 text-slate-500 border border-slate-700/50 hover:text-slate-300 active:scale-95'
              }`}
              title={isAdbActive ? "Add Device (Live Telemetry & Scan Active)" : "Device Manager (Live Telemetry Switched OFF)"}
            >
              <PlusCircle className={`w-4 h-4 transform group-hover:rotate-90 transition-transform duration-300 ${!isAdbActive ? 'text-slate-400' : ''}`} />
            </button>
          )}
        </div>

        {/* Sidebar Body */}
        {isSidebarCollapsed ? (
          /* COLLAPSED ICON SIDEBAR VIEW */
          <div className="flex-1 flex flex-col items-center py-4 space-y-5 overflow-y-auto px-2">
            {/* Add Device Logo/Button in Collapsed view */}
            <button
              onClick={() => {
                setIsOnboardingOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              className={`p-3 rounded-xl transition-all cursor-pointer group relative ${
                isAdbActive
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)] hover:scale-110 active:scale-95'
                  : 'bg-slate-800/40 hover:bg-slate-800/80 text-slate-500 border border-slate-700/50 hover:text-slate-300 active:scale-95'
              }`}
              title={isAdbActive ? "Add Device (Live Telemetry Active)" : "Device Manager (Live Telemetry Switched OFF)"}
            >
              <PlusCircle className={`w-5 h-5 transform group-hover:rotate-90 transition-transform duration-300 ${!isAdbActive ? 'text-slate-400' : ''}`} />
              {isAdbActive ? (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
              ) : (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-slate-500 rounded-full border border-slate-700" title="Telemetry OFF (Offline Safe Mode)" />
              )}
            </button>

            <div className="w-8 h-px bg-white/10" />

            {/* System Overview Icon Button */}
            <button
              onClick={() => {
                setCurrentView('overview');
                setSelectedSession(null);
                setIsMobileSidebarOpen(false);
              }}
              className={`p-3 rounded-xl transition-all cursor-pointer group relative ${
                currentView === 'overview'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              title="System Overview"
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>

            <div className="w-8 h-px bg-white/10" />

            {/* Connected Devices Icons Column */}
            <div className="flex flex-col items-center space-y-3 w-full">
              <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full" title="Connected Device Count">
                {sessions.length}
              </span>
              {sessions.map(session => {
                const isOnline = onlineSessions.has(session.id);
                const isActive = selectedSession?.id === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => selectSession(session)}
                    className={`relative p-2.5 rounded-xl border transition-all cursor-pointer group ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)] scale-105'
                        : 'bg-white/[0.02] border-white/5 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5'
                    }`}
                    title={`${session.device_id.replace(/_/g, ' ')} (${isOnline ? 'ONLINE' : 'OFFLINE'})`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                      isOnline ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-gray-500'
                    }`} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* EXPANDED FULL SIDEBAR VIEW */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* System Dashboard Navigation */}
            <div className="p-4 border-b border-white/5">
              <button
                onClick={() => {
                  setCurrentView('overview');
                  setSelectedSession(null);
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  currentView === 'overview' 
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-cyan-400" />
                System Overview
              </button>
            </div>

            {/* Connected Devices List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-outfit flex items-center gap-1.5">
                  <Smartphone className="w-3 h-3 text-cyan-400" />
                  Connected Devices
                </span>
                <span className="text-[9px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  {sessions.length}
                </span>
              </div>
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
                          ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_4px_20px_rgba(6,182,212,0.1)]' 
                          : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.04] hover:border-white/15'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                          <h3 className="font-semibold text-xs truncate max-w-36 text-white">
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

            {/* Bottom System Footer */}
            <div className="p-3 border-t border-white/5 hidden md:flex items-center justify-between text-xs text-gray-400">
              <span className="text-[10px] font-mono text-gray-500">v2.4 Forensic System</span>
            </div>
          </div>
        )}
      </div>

      {/* Main workspace display area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
        {currentView === 'overview' ? (
          <SystemDashboard
            handleThreatClick={handleThreatClick}
            getThreatColorClass={getThreatColorClass}
            liveLogs={liveLogs}
            sessions={sessions}
            toggleSidebar={toggleSidebar}
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
            toggleSidebar={toggleSidebar}
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
        isAdbActive={isAdbActive}
        onToggleAdb={toggleAdbServer}
      />
    </div>
  );
}
