import React, { useState } from 'react';
import { 
  AlertTriangle, Terminal, Grid, Smartphone, Database, Shield 
} from 'lucide-react';
import KPIStats from './KPIStats';
import LiveConsole from './LiveConsole';

export default function ThreatMonitor({
  selectedSession,
  kpis,
  threats,
  selectedThreat,
  handleThreatClick,
  liveLogs,
  getThreatColorClass
}) {
  const [activeTab, setActiveTab] = useState('threats'); // 'threats', 'live', 'sessions'

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden z-10">
      {/* HEADER BAR */}
      <header className="px-8 py-5 border-b border-white/5 bg-[#07080d]/60 backdrop-blur-md flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 font-outfit text-white">
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
            <KPIStats kpis={kpis} selectedSession={selectedSession} />

            {/* THREAT ALERTS TABLES */}
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
          <LiveConsole liveLogs={liveLogs} />
        )}

        {/* TAB 3: SESSIONS / DEVICE DETAILS */}
        {activeTab === 'sessions' && selectedSession && (
          <div className="space-y-6 animate-fadeIn max-w-4xl mx-auto">
            <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md space-y-6">
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold font-outfit text-white">Device Audit Registry</h3>
                <p className="text-xs text-gray-400 mt-1">Detailed hardware and environment configurations captured during registration</p>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs font-mono text-gray-300">
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">DATABASE SESSION ID</span>
                  <span className="text-white font-semibold">#{selectedSession.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">DEVICE HARDWARE ID</span>
                  <span className="text-white font-semibold">{selectedSession.device_id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">ANDROID VERSION</span>
                  <span className="text-white font-semibold">Android {selectedSession.os_version || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">API BUILD LEVEL</span>
                  <span className="text-white font-semibold">SDK {selectedSession.api_level || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">SSID (CONNECTION)</span>
                  <span className="text-white font-semibold">{selectedSession.ssid || 'Cellular Data'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">IP ADDRESS</span>
                  <span className="text-white font-semibold">{selectedSession.ip_address || '127.0.0.1'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">CONNECTION TYPE</span>
                  <span className="text-white font-semibold uppercase">{selectedSession.connection_type || 'WiFi'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.03]">
                  <span className="text-gray-500 font-sans">REGISTRATION DATE</span>
                  <span className="text-white font-semibold">{new Date(selectedSession.connected_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
