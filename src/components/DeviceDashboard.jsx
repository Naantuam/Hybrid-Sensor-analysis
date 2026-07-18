import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Smartphone, Terminal, Database, Shield, Activity, 
  Menu, Play, Square, Loader2, RefreshCw, Download, Radio, Network, Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import LiveConsole from './LiveConsole';

// Custom dot component for the risk score line chart to show severity-coded dot colors
const SeverityDot = (props) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  
  let color = '#10b981'; // Benign / Green
  const score = payload.score || 0;
  
  if (payload.level === 'CRITICAL' || score >= 80) color = '#ef4444'; // Red
  else if (payload.level === 'HIGH' || score >= 50) color = '#f97316'; // Orange
  else if (payload.level === 'SUSPICIOUS' || score >= 25) color = '#eab308'; // Yellow

  return (
    <circle cx={cx} cy={cy} r={5} fill={color} stroke="#07080d" strokeWidth={1.5} />
  );
};

export default function DeviceDashboard({
  selectedSession,
  kpis,
  threats,
  selectedThreat,
  handleThreatClick,
  liveLogs,
  getThreatColorClass,
  toggleSidebar
}) {
  const [activeTab, setActiveTab] = useState('threats'); // 'threats', 'live', 'details'
  
  // Controls states
  const [runningSerials, setRunningSerials] = useState([]);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState('');
  const [wirelessHandoffStep, setWirelessHandoffStep] = useState(0); // 0=ready, 1=preparing, 2=unplug, 3=connecting, 4=success, 5=unauthorized
  const [resolvedIp, setResolvedIp] = useState('');
  
  // Local telemetry events
  const [events, setEvents] = useState([]);
  
  // Sync running agents list and device events
  const syncDeviceDetails = () => {
    if (!selectedSession) return;
    
    // Sync agents status
    fetch('/api/agent/status')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setRunningSerials(data.activeSerials || []);
        }
      })
      .catch(err => console.error('[!] Error fetching agent statuses:', err));

    // Fetch session events
    fetch(`/api/sessions/${selectedSession.id}/events`)
      .then(res => res.json())
      .then(data => {
        setEvents(data || []);
      })
      .catch(err => console.error('[!] Error loading session events:', err));
  };

  useEffect(() => {
    syncDeviceDetails();
    const interval = setInterval(syncDeviceDetails, 4000);
    return () => clearInterval(interval);
  }, [selectedSession]);

  const toggleAgent = () => {
    if (!selectedSession) return;
    const isRunning = runningSerials.includes(selectedSession.device_id);
    const endpoint = isRunning ? '/api/agent/stop' : '/api/agent/start';
    
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        serial: selectedSession.device_id,
        connectionType: selectedSession.device_id.includes(':') ? 'wireless_adb' : 'usb_adb'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        syncDeviceDetails();
      }
    })
    .catch(err => console.error('[!] Error toggling bridge agent:', err));
  };

  const handleProvision = () => {
    if (!selectedSession) return;
    setIsProvisioning(true);
    setProvisionStatus(`Provisioning ${selectedSession.device_id}...`);
    fetch('/api/agent/provision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ serial: selectedSession.device_id })
    })
    .then(res => res.json())
    .then(data => {
      setIsProvisioning(false);
      if (data.status === 'success') {
        setProvisionStatus(`Success: ${selectedSession.device_id} preconfigured!`);
      } else {
        setProvisionStatus(`Error: ${data.error}`);
      }
    })
    .catch(err => {
      setIsProvisioning(false);
      setProvisionStatus('Network error.');
      console.error('[!] Provision error:', err);
    });
  };

  const handlePrepareWireless = () => {
    if (!selectedSession) return;
    setWirelessHandoffStep(1);
    setProvisionStatus('Enabling TCP debugging port 5555...');
    
    fetch('/api/agent/prepare-wireless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: selectedSession.device_id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        setResolvedIp(data.ip);
        setWirelessHandoffStep(2);
        setProvisionStatus(`TCP port enabled! Resolved IP: ${data.ip}`);
      } else {
        setWirelessHandoffStep(0);
        setProvisionStatus('');
        alert(data.message || 'Wireless handoff failed.');
      }
    })
    .catch(err => {
      setWirelessHandoffStep(0);
      setProvisionStatus('');
      console.error('[!] prepare-wireless error:', err);
    });
  };

  const handleConnectWireless = () => {
    if (!resolvedIp) return;
    setWirelessHandoffStep(3);
    setProvisionStatus(`Connecting Wi-Fi link: ${resolvedIp}...`);
    
    fetch('/api/agent/connect-wireless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: resolvedIp })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        if (data.deviceStatus === 'device') {
          setWirelessHandoffStep(4);
          setProvisionStatus(`Paired wirelessly to ${resolvedIp}`);
          alert(`Wireless connection established successfully!`);
          setWirelessHandoffStep(0);
        } else if (data.deviceStatus === 'unauthorized') {
          setWirelessHandoffStep(5);
          setProvisionStatus('Allow USB debugging on handset popup.');
        } else {
          setWirelessHandoffStep(0);
          setProvisionStatus('');
          alert(`Device offline or unresponsive.`);
        }
      } else {
        setWirelessHandoffStep(0);
        setProvisionStatus('');
        alert(data.error || 'Wireless pairing failed.');
      }
    })
    .catch(err => {
      setWirelessHandoffStep(0);
      setProvisionStatus('');
      console.error('[!] connect-wireless error:', err);
    });
  };

  // Compile timeline data for the charts
  const getChartsData = () => {
    // 1. Compile Telemetry Events over time (bucketed by minute)
    const telGroup = {};
    events.forEach(e => {
      const timeStr = new Date(e.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      telGroup[timeStr] = (telGroup[timeStr] || 0) + 1;
    });
    
    // Sort chronological (reverse of descending from DB)
    const telTimeline = Object.keys(telGroup).map(time => ({
      time,
      count: telGroup[time]
    })).reverse();

    // 2. Compile Threat Risk Scores over time (bucketed by minute, maximum score in that minute)
    const threatGroup = {};
    threats.forEach(t => {
      const timeStr = new Date(t.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      threatGroup[timeStr] = Math.max(threatGroup[timeStr] || 0, t.score);
    });

    const threatTimeline = Object.keys(threatGroup).map(time => {
      const maxScore = threatGroup[time];
      const match = threats.find(t => new Date(t.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) === time);
      return {
        time,
        score: maxScore,
        level: match ? match.threat_level : 'BENIGN'
      };
    }).reverse();

    // Fill mock points if data is empty so the lines still display nicely
    const fallbackTel = telTimeline.length > 0 ? telTimeline : [
      { time: '00:00', count: 0 },
      { time: '04:00', count: 0 },
      { time: '08:00', count: 0 }
    ];

    const fallbackThreat = threatTimeline.length > 0 ? threatTimeline : [
      { time: '00:00', score: 0, level: 'BENIGN' },
      { time: '04:00', score: 0, level: 'BENIGN' },
      { time: '08:00', score: 0, level: 'BENIGN' }
    ];

    return { telTimeline: fallbackTel, threatTimeline: fallbackThreat };
  };

  const { telTimeline, threatTimeline } = getChartsData();
  const isBridgeRunning = runningSerials.includes(selectedSession?.device_id);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
      
      {/* HEADER BAR */}
      <header className="px-4 md:px-8 py-4 border-b border-white/5 bg-[#07080d]/60 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 font-outfit text-white">
              📱 {selectedSession?.device_id.replace(/_/g, ' ') || 'Device Workspace'}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Android {selectedSession?.os_version} (API {selectedSession?.api_level}) | Connection: {selectedSession?.connection_type?.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-white/[0.02] border border-white/5 rounded-xl p-1 gap-1 overflow-x-auto">
          {['threats', 'live', 'details'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'threats' ? 'Threat Center' : tab === 'live' ? 'Live Console' : 'Device details'}
            </button>
          ))}
        </div>
      </header>

      {/* WORKSPACE CONTENT */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {activeTab === 'threats' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* TOP ROW: SPECIFICATIONS & CONTROLS SPLIT */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* SPECIFICATIONS */}
              <div className="lg:col-span-2 bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 backdrop-blur-md space-y-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block border-b border-white/5 pb-1.5">
                  Device Information
                </span>
                <div className="grid grid-cols-2 gap-y-2 text-xs font-mono text-gray-300">
                  <span className="text-gray-500">Node ID:</span>
                  <span className="font-semibold text-white truncate max-w-32">#{selectedSession?.id}</span>
                  
                  <span className="text-gray-500">SSID:</span>
                  <span className="font-semibold text-white truncate max-w-32">{selectedSession?.ssid || 'Cellular/Unknown'}</span>

                  <span className="text-gray-500">IP address:</span>
                  <span className="font-semibold text-white">{selectedSession?.ip_address || '127.0.0.1'}</span>

                  <span className="text-gray-500">Battery Saver:</span>
                  <span className={`font-semibold ${selectedSession?.battery_saver_active ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {selectedSession?.battery_saver_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  
                  <span className="text-gray-500">Audit Status:</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                    ACTIVE STREAMING
                  </span>
                </div>
              </div>

              {/* CONTROLS CARD */}
              <div className="lg:col-span-3 bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 backdrop-blur-md space-y-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block border-b border-white/5 pb-1.5">
                  Hardware Control Center
                </span>

                <div className="flex flex-wrap gap-3">
                  {/* Start/Stop Bridge */}
                  <button
                    onClick={toggleAgent}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      isBridgeRunning 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    {isBridgeRunning ? (
                      <><Square className="w-3.5 h-3.5 fill-current" /> STOP BRIDGE</>
                    ) : (
                      <><Play className="w-3.5 h-3.5 fill-current" /> START BRIDGE</>
                    )}
                  </button>

                  {/* Auto setup */}
                  <button
                    onClick={handleProvision}
                    disabled={isProvisioning}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {isProvisioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    AUTO-SETUP
                  </button>

                  {/* Wireless Mode TCP setup */}
                  {wirelessHandoffStep === 0 && (
                    <button
                      onClick={handlePrepareWireless}
                      className="flex items-center gap-1.5 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all rounded-xl text-xs font-bold"
                    >
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                      USB TO WI-FI
                    </button>
                  )}
                </div>

                {/* TCP Wizard status/action steps */}
                {wirelessHandoffStep === 1 && (
                  <div className="flex items-center gap-2 text-xs text-purple-400 bg-purple-950/20 p-2 rounded-xl border border-purple-900/35">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enabling TCP port 5555...
                  </div>
                )}
                {wirelessHandoffStep === 2 && (
                  <div className="space-y-2.5 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl">
                    <div className="text-[11px] text-amber-400">
                      ⚠️ Unplug the physical USB cable now, then click connect.
                    </div>
                    <button
                      onClick={handleConnectWireless}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
                    >
                      Establish Wireless Link ({resolvedIp})
                    </button>
                  </div>
                )}
                {wirelessHandoffStep === 3 && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/20 p-2 rounded-xl border border-emerald-900/35">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting wirelessly to {resolvedIp}...
                  </div>
                )}
                {wirelessHandoffStep === 5 && (
                  <div className="space-y-2 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl">
                    <div className="text-[11px] text-amber-400">
                      ⚠️ Approve the authorization prompt popping up on your device screen!
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleConnectWireless} className="px-3 py-1 bg-amber-600 text-white text-xs rounded font-bold">Retry</button>
                      <button onClick={() => setWirelessHandoffStep(0)} className="px-3 py-1 bg-white/5 text-gray-400 text-xs rounded font-bold">Cancel</button>
                    </div>
                  </div>
                )}

                {provisionStatus && (
                  <div className="bg-[#05060b] border border-white/5 rounded-xl p-2.5 font-mono text-[10px] text-cyan-400 break-all">
                    {provisionStatus}
                  </div>
                )}
              </div>

            </div>

            {/* MIDDLE ROW: LINE CHARTS TRENDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* CHART 1: RISK SCORE OVER TIME */}
              <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 backdrop-blur-md space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-red-400" />
                    Vulnerability & Risk Score Trend
                  </h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Chronological maximum risk score recorded per check</p>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={threatTimeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6b7280" 
                        fontSize={9} 
                        tickLine={false} 
                      />
                      <YAxis 
                        stroke="#6b7280" 
                        fontSize={9} 
                        tickLine={false} 
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                        labelStyle={{ color: '#9ca3af', fontSize: '9px' }}
                        itemStyle={{ color: '#fff', fontSize: '10px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#f97316" 
                        strokeWidth={1.5}
                        dot={<SeverityDot />}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* CHART 2: TELEMETRY INTENSITY */}
              <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 backdrop-blur-md space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Telemetry Packet Query Density
                  </h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Frequency of sensor updates sent to the edge loop</p>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={telTimeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6b7280" 
                        fontSize={9} 
                        tickLine={false} 
                      />
                      <YAxis 
                        stroke="#6b7280" 
                        fontSize={9} 
                        tickLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                        labelStyle={{ color: '#9ca3af', fontSize: '9px' }}
                        itemStyle={{ color: '#fff', fontSize: '10px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#06b6d4" 
                        strokeWidth={1.5}
                        dot={{ r: 3, fill: '#06b6d4', stroke: '#07080d' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* BOTTOM ROW: DEVICE SPECIFIC THREAT LOG TABLE */}
            <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 backdrop-blur-md flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                <div>
                  <h3 className="font-extrabold font-outfit text-xs text-white uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    Device Threat Incidents ({threats.length})
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">Select a threat record row to inspect MITRE framework mappings</p>
                </div>
              </div>

              <div className="overflow-x-auto max-h-60 pr-1">
                {threats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-500 space-y-2">
                    <Database className="w-8 h-8 opacity-30" />
                    <p className="text-xs">No threats recorded for this handset session yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/5 uppercase text-[8px] tracking-widest font-extrabold">
                        <th className="py-2 px-3">Audit Timestamp</th>
                        <th className="py-2 px-3">Target App Package</th>
                        <th className="py-2 px-3">Severity</th>
                        <th className="py-2 px-3 text-right">Risk Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {threats.map(alert => {
                        const isSelected = selectedThreat?.id === alert.id;
                        return (
                          <tr 
                            key={alert.id}
                            onClick={() => handleThreatClick(alert)}
                            className={`hover:bg-cyan-500/[0.03] hover:text-white cursor-pointer transition-colors duration-150 ${
                              isSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[9px] text-gray-400">
                              {new Date(alert.timestamp || alert.connected_at).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-gray-300 font-mono text-[10px]">{alert.app_package}</td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${getThreatColorClass(alert.threat_level)}`}>
                                {alert.threat_level}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-extrabold font-mono text-cyan-400">
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

        {activeTab === 'live' && (
          <LiveConsole liveLogs={liveLogs.filter(log => {
            // Filter live logs to only show messages containing the selected session device ID
            if (!selectedSession) return false;
            // Matches device_id or matches the specific string
            const devId = selectedSession.device_id.toLowerCase();
            return log.message.toLowerCase().includes(devId) || log.message.toLowerCase().includes(selectedSession.id.toString());
          })} />
        )}

        {activeTab === 'details' && selectedSession && (
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4 max-w-3xl mx-auto">
            <div className="border-b border-white/5 pb-2.5">
              <h3 className="text-sm font-bold font-outfit text-white uppercase tracking-wider">Device Configuration Metadata</h3>
              <p className="text-[11px] text-gray-500 mt-1">Audit trail details collected during session handshake</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs font-mono text-gray-300">
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Session Entry ID</span>
                <span className="text-white font-semibold">#{selectedSession.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Hardware Serial ID</span>
                <span className="text-white font-semibold">{selectedSession.device_id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">OS Release / Version</span>
                <span className="text-white font-semibold">Android {selectedSession.os_version || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">API Level SDK</span>
                <span className="text-white font-semibold">SDK {selectedSession.api_level || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Wi-Fi Connection SSID</span>
                <span className="text-white font-semibold">{selectedSession.ssid || 'Cellular'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Active IP address</span>
                <span className="text-white font-semibold">{selectedSession.ip_address || '127.0.0.1'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Bridge connection mode</span>
                <span className="text-white font-semibold uppercase">{selectedSession.connection_type || 'unknown'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-gray-500 font-sans">Registered Time</span>
                <span className="text-white font-semibold">{new Date(selectedSession.connected_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
