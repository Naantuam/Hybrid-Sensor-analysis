import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Shield, Smartphone, Activity, Database, 
  Terminal, Search, XCircle, RefreshCw, Layers
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip 
} from 'recharts';

export default function SystemDashboard({ 
  handleThreatClick, 
  getThreatColorClass,
  liveLogs,
  sessions
}) {
  const [stats, setStats] = useState({ max_score: 0, total_threats: 0, total_events: 0, total_devices: 0 });
  const [allThreats, setAllThreats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering states
  const [severityFilter, setSeverityFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch system statistics and threat logs
  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, threatsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/threats')
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (threatsRes.ok) {
        const threatsData = await threatsRes.json();
        setAllThreats(threatsData);
      }
    } catch (err) {
      console.error('[!] Error loading system data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh stats periodically
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Compute severity levels for the pie chart based on fetched threats
  const severityCounts = allThreats.reduce((acc, curr) => {
    const level = curr.threat_level || 'BENIGN';
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, { CRITICAL: 0, HIGH: 0, SUSPICIOUS: 0, BENIGN: 0 });

  const chartData = [
    { name: 'Critical', value: severityCounts.CRITICAL, color: '#ef4444', key: 'CRITICAL' },
    { name: 'High', value: severityCounts.HIGH, color: '#f97316', key: 'HIGH' },
    { name: 'Suspicious', value: severityCounts.SUSPICIOUS, color: '#eab308', key: 'SUSPICIOUS' },
    { name: 'Benign', value: severityCounts.BENIGN, color: '#10b981', key: 'BENIGN' }
  ].filter(d => d.value > 0);

  // Fallback data if no threats logged yet
  const displayChartData = chartData.length > 0 ? chartData : [
    { name: 'No Alerts (Clean)', value: 1, color: '#10b981', key: 'BENIGN' }
  ];

  // Filtered threats
  const filteredThreats = allThreats.filter(threat => {
    const matchesSeverity = severityFilter ? threat.threat_level === severityFilter : true;
    const matchesSearch = searchQuery 
      ? (threat.app_package?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         threat.device_id?.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesSeverity && matchesSearch;
  });

  const handleSliceClick = (entry) => {
    if (severityFilter === entry.key) {
      setSeverityFilter(null); // Toggle filter off if clicked again
    } else {
      setSeverityFilter(entry.key);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 md:p-8 max-w-7xl mx-auto">
      
      {/* 1. AGGREGATED SYSTEM STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Max Risk Rating</p>
          <div className="flex justify-between items-baseline">
            <h3 className="text-2xl font-bold font-outfit text-red-500 font-mono">
              {stats.max_score || 0} <span className="text-xs text-gray-600">PTS</span>
            </h3>
            <Shield className="w-5 h-5 text-red-500/30" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Highest single vulnerability score</p>
        </div>

        <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Threat Alarms</p>
          <div className="flex justify-between items-baseline">
            <h3 className="text-2xl font-bold font-outfit text-orange-400 font-mono">
              {stats.total_threats || 0}
            </h3>
            <AlertTriangle className="w-5 h-5 text-orange-400/30" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Aggregated active security alerts</p>
        </div>

        <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500" />
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Total Packets</p>
          <div className="flex justify-between items-baseline">
            <h3 className="text-2xl font-bold font-outfit text-cyan-400 font-mono">
              {stats.total_events || 0}
            </h3>
            <Activity className="w-5 h-5 text-cyan-400/30" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Events processed across the system</p>
        </div>

        <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-purple-500" />
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Active Devices</p>
          <div className="flex justify-between items-baseline">
            <h3 className="text-2xl font-bold font-outfit text-purple-400 font-mono">
              {sessions.length || stats.total_devices || 0}
            </h3>
            <Smartphone className="w-5 h-5 text-purple-400/30" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Registered mobile handset nodes</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2. RISK SPECIFICATION CHARTS (PIE CHART) */}
        <div className="lg:col-span-1 bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="font-extrabold font-outfit text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Risk Severity Profile
            </h3>
            <p className="text-[11px] text-gray-400 mt-1">
              Distribution of alerts. Click a color segment to filter the security logs.
            </p>
          </div>

          <div className="h-44 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                  cursor="pointer"
                  onClick={handleSliceClick}
                >
                  {displayChartData.map((entry, index) => {
                    const isFilteredOut = severityFilter && severityFilter !== entry.key;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        opacity={isFilteredOut ? 0.35 : 1}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth={2}
                      />
                    );
                  })}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af', fontSize: '10px' }}
                  itemStyle={{ color: '#fff', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold font-mono text-white">{allThreats.length}</span>
              <span className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Alarms</span>
            </div>
          </div>

          {/* Legend / Click Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px]">
            {chartData.map((item, idx) => {
              const isActive = severityFilter === item.key;
              return (
                <button
                  key={idx}
                  onClick={() => handleSliceClick(item)}
                  className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all ${
                    isActive 
                      ? 'bg-white/5 border-white/10 text-white font-bold' 
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.name} ({item.value})</span>
                </button>
              );
            })}
          </div>

        </div>

        {/* 3. NEATLY SECTIONED SYSTEM LOGS PANEL */}
        <div className="lg:col-span-2 bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col h-full">
          
          {/* Header Bar for Logs */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/5 mb-4">
            <div>
              <h3 className="font-extrabold font-outfit text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-orange-400" />
                Forensic System Logs
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Chronological list of identified security incidents</p>
            </div>
            
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search packages, devices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/40 font-sans"
              />
            </div>
          </div>

          {/* Active Filters Bar */}
          {(severityFilter || searchQuery) && (
            <div className="flex items-center gap-2 mb-3.5 bg-cyan-500/5 border border-cyan-500/10 p-2 rounded-xl">
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Active Filters:</span>
              {severityFilter && (
                <span className="text-[9px] bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  Severity: {severityFilter}
                  <button onClick={() => setSeverityFilter(null)} className="text-cyan-400 hover:text-white font-bold ml-0.5">×</button>
                </span>
              )}
              {searchQuery && (
                <span className="text-[9px] bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  Query: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="text-cyan-400 hover:text-white font-bold ml-0.5">×</button>
                </span>
              )}
              <button 
                onClick={() => { setSeverityFilter(null); setSearchQuery(''); }}
                className="text-[9px] text-gray-400 hover:text-white ml-auto font-semibold flex items-center gap-0.5"
              >
                <XCircle className="w-3 h-3" />
                Clear All
              </button>
            </div>
          )}

          {/* Logs Table Area */}
          <div className="flex-1 overflow-y-auto max-h-[300px] pr-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 space-y-2">
                <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
                <span className="text-xs">Fetching log records...</span>
              </div>
            ) : filteredThreats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-600 space-y-3">
                <Database className="w-10 h-10 opacity-30" />
                <p className="text-xs">No incidents match the active search/filters.</p>
              </div>
            ) : (
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5 uppercase text-[8px] tracking-widest font-extrabold">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Device Node</th>
                    <th className="py-2.5 px-3">Target App</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3 text-right">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02] font-sans">
                  {filteredThreats.map(alert => (
                    <tr 
                      key={alert.id}
                      onClick={() => handleThreatClick(alert)}
                      className="hover:bg-cyan-500/[0.03] hover:text-white cursor-pointer transition-colors duration-150"
                    >
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[9px] text-gray-500">
                        {new Date(alert.timestamp || alert.connected_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {alert.device_id?.replace(/_/g, ' ') || 'Unknown Device'}
                      </td>
                      <td className="py-3 px-3 text-gray-300 font-mono text-[10px] truncate max-w-[120px]" title={alert.app_package}>
                        {alert.app_package?.split('.').pop() || alert.app_package}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${getThreatColorClass(alert.threat_level)}`}>
                          {alert.threat_level}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold font-mono text-cyan-400">
                        {alert.score} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>

      </div>

      {/* 4. REAL-TIME EVENT STREAM (LIVE SYSTEM-WIDE CONSOLE) */}
      <div className="bg-black/45 border border-white/5 rounded-2xl p-5 backdrop-blur-md">
        <h3 className="font-extrabold font-outfit text-xs text-white uppercase tracking-wider flex items-center gap-2 mb-3.5">
          <Terminal className="w-4 h-4 text-emerald-400" />
          Real-time Event logs (System-wide Console)
        </h3>
        <div className="bg-[#05060a] border border-white/5 rounded-xl p-4 font-mono text-[11px] text-emerald-400/90 h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
          {liveLogs.length === 0 ? (
            <div className="text-gray-500 italic text-center py-10">
              No live telemetry event packets streaming currently. Start an ADB bridge or activate Termux daemon...
            </div>
          ) : (
            liveLogs.slice().reverse().map((log, idx) => (
              <div key={idx} className="flex gap-2 hover:bg-white/[0.02] py-0.5 px-1 rounded transition-colors">
                <span className="text-gray-600 shrink-0">{log.time}</span>
                <span className={`font-bold shrink-0 ${
                  log.tag === 'CRITICAL' ? 'text-red-500' :
                  log.tag === 'HIGH' ? 'text-orange-500' :
                  log.tag === 'SUSPICIOUS' ? 'text-yellow-500' : 'text-cyan-400'
                }`}>
                  [{log.tag}]
                </span>
                <span className="text-gray-300 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
