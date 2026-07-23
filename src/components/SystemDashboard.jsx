import React, { useState, useEffect } from 'react';
import { 
  Shield, Database, Terminal, Search, XCircle, RefreshCw,
  Layers, TrendingUp, TrendingDown, Minus, Fingerprint
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip 
} from 'recharts';

export default function SystemDashboard({ 
  handleThreatClick, 
  getThreatColorClass,
  liveLogs,
  sessions,
  toggleSidebar
}) {
  const [stats, setStats] = useState({
    max_score: 0,
    total_packets: 0,
    critical_count: 0,
    high_count: 0,
    suspicious_count: 0,
    benign_count: 0,
    total_devices: 0
  });
  const [allThreats, setAllThreats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [severityFilter, setSeverityFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, threatsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/threats')
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (threatsRes.ok) setAllThreats(await threatsRes.json());
    } catch (err) {
      console.error('[!] Error loading system data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Use server-side counts — don't recompute from allThreats which may be limited to 500 rows
  const severityCounts = {
    CRITICAL:   stats.critical_count   || 0,
    HIGH:       stats.high_count       || 0,
    SUSPICIOUS: stats.suspicious_count || 0,
    BENIGN:     stats.benign_count     || 0
  };

  const totalPackets = stats.total_packets || 0;

  // Pie chart data — include all 4 levels
  const SEVERITY_DEFS = [
    { name: 'Critical',   key: 'CRITICAL',   color: '#ef4444' },
    { name: 'High',       key: 'HIGH',        color: '#f97316' },
    { name: 'Suspicious', key: 'SUSPICIOUS',  color: '#eab308' },
    { name: 'Benign',     key: 'BENIGN',      color: '#10b981' }
  ];

  const chartData = SEVERITY_DEFS
    .map(d => ({ ...d, value: severityCounts[d.key] }))
    .filter(d => d.value > 0);

  const displayChartData = chartData.length > 0 ? chartData : [
    { name: 'No Data', value: 1, color: '#374151', key: 'NONE' }
  ];

  // Risk score stats
  const scores = allThreats.map(t => t.score || 0).filter(s => s > 0);
  const maxScore = scores.length > 0 ? Math.max(...scores) : stats.max_score || 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const handleSliceClick = (entry) => {
    setSeverityFilter(prev => prev === entry.key ? null : entry.key);
  };

  const filteredThreats = allThreats.filter(threat => {
    const matchesSeverity = severityFilter ? threat.threat_level === severityFilter : true;
    const matchesSearch = searchQuery 
      ? (threat.app_package?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         threat.device_id?.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* HEADER BAR */}
      <header className="px-4 md:px-8 py-4 border-b border-white/5 bg-[#07080d]/60 backdrop-blur-md flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 text-cyan-400 hover:text-white rounded-xl hover:bg-cyan-500/10 border border-cyan-500/20 flex-shrink-0 cursor-pointer"
            title="Toggle Forensic Sidebar"
          >
            <Fingerprint className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 font-outfit text-white">
              🛡️ FORENSIC SENSOR MONITOR
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              System-wide real-time threat intelligence & forensic telemetry audit
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-6 animate-fadeIn p-4 md:p-8 max-w-7xl mx-auto w-full pb-10">

        {/* MAIN GRID: PIE + LOGS TABLE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — RISK SEVERITY PIE CARD */}
          <div className="lg:col-span-1 bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-5">
            <div>
              <h3 className="font-extrabold font-outfit text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Risk Severity Profile
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                Distribution of all evaluated sensor events. Click a segment to filter the logs.
              </p>
            </div>

            {/* Donut chart */}
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
                    {displayChartData.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.color}
                        opacity={severityFilter && severityFilter !== entry.key ? 0.2 : 1}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af', fontSize: '10px' }}
                    itemStyle={{ color: '#fff', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centre label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold font-mono text-white">{totalPackets}</span>
                <span className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Packets</span>
              </div>
            </div>

            {/* Legend — all 4 levels always shown */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {SEVERITY_DEFS.map((item) => {
                const count = severityCounts[item.key];
                const pct = totalPackets > 0 ? Math.round((count / totalPackets) * 100) : 0;
                const isActive = severityFilter === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleSliceClick(item)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                      isActive 
                        ? 'bg-white/5 border-white/10 text-white font-bold' 
                        : 'border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{item.name}</div>
                      <div className="text-gray-500 text-[9px]">{count.toLocaleString()} · {pct}%</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Risk score rating */}
            <div className="border-t border-white/5 pt-4 space-y-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Risk Score Rating</p>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Score range across all evaluated incidents. Higher scores indicate compound multi-sensor surveillance patterns.
              </p>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-2 text-center">
                  <TrendingUp className="w-3 h-3 text-red-400 mx-auto mb-1" />
                  <div className="font-mono font-bold text-red-400 text-sm">{maxScore}</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wide">Max</div>
                </div>
                <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-2 text-center">
                  <Minus className="w-3 h-3 text-cyan-400 mx-auto mb-1" />
                  <div className="font-mono font-bold text-cyan-400 text-sm">{avgScore}</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wide">Avg</div>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-2 text-center">
                  <TrendingDown className="w-3 h-3 text-emerald-400 mx-auto mb-1" />
                  <div className="font-mono font-bold text-emerald-400 text-sm">{minScore}</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wide">Least</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — FORENSIC LOGS TABLE */}
          <div className="lg:col-span-2 bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/5 mb-1">
              <div>
                <h3 className="font-extrabold font-outfit text-sm text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-orange-400" />
                  Forensic System Logs
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Chronological record of all identified security incidents</p>
              </div>
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

            {/* Packet totals + per-severity sub-header */}
            <div className="grid grid-cols-5 gap-2 py-3 border-b border-white/5 mb-3">
              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">Total Packets</span>
                <span className="text-lg font-bold font-mono text-cyan-400">{totalPackets.toLocaleString()}</span>
              </div>
              {[
                { label: 'Critical',   key: 'CRITICAL',   color: 'text-red-400',     bg: 'hover:bg-red-500/5'     },
                { label: 'High',       key: 'HIGH',        color: 'text-orange-400',  bg: 'hover:bg-orange-500/5'  },
                { label: 'Suspicious', key: 'SUSPICIOUS',  color: 'text-amber-400',   bg: 'hover:bg-amber-500/5'   },
                { label: 'Benign',     key: 'BENIGN',      color: 'text-emerald-400', bg: 'hover:bg-emerald-500/5' }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => handleSliceClick(item)}
                  className={`flex flex-col text-left px-2 rounded-lg transition-all ${item.bg} ${
                    severityFilter === item.key ? 'bg-white/5 ring-1 ring-white/10' : ''
                  }`}
                >
                  <span className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">{item.label}</span>
                  <span className={`text-lg font-bold font-mono ${item.color}`}>
                    {severityCounts[item.key].toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            {/* Active Filters */}
            {(severityFilter || searchQuery) && (
              <div className="flex items-center gap-2 mb-3 bg-cyan-500/5 border border-cyan-500/10 p-2 rounded-xl">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Filters:</span>
                {severityFilter && (
                  <span className="text-[9px] bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    {severityFilter}
                    <button onClick={() => setSeverityFilter(null)} className="hover:text-white font-bold ml-0.5">×</button>
                  </span>
                )}
                {searchQuery && (
                  <span className="text-[9px] bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="hover:text-white font-bold ml-0.5">×</button>
                  </span>
                )}
                <button 
                  onClick={() => { setSeverityFilter(null); setSearchQuery(''); }}
                  className="text-[9px] text-gray-400 hover:text-white ml-auto font-semibold flex items-center gap-0.5"
                >
                  <XCircle className="w-3 h-3" /> Clear
                </button>
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-y-auto max-h-[320px] pr-1">
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
                      <th className="py-2.5 px-3 text-right">Risk Score</th>
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
                          {alert.device_id?.replace(/_/g, ' ') || 'Unknown'}
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

        {/* REAL-TIME CONSOLE */}
        <div className="bg-black/45 border border-white/5 rounded-2xl p-5 backdrop-blur-md">
          <h3 className="font-extrabold font-outfit text-xs text-white uppercase tracking-wider flex items-center gap-2 mb-3.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            Real-time Event Logs (System-wide Console)
          </h3>
          <div className="bg-[#05060a] border border-white/5 rounded-xl p-4 font-mono text-[11px] text-emerald-400/90 h-40 overflow-y-auto space-y-1.5">
            {liveLogs.length === 0 ? (
              <div className="text-gray-500 italic text-center py-10">
                No live telemetry event packets streaming. Start an ADB bridge or activate Termux daemon...
              </div>
            ) : (
              liveLogs.slice().reverse().map((log, idx) => (
                <div key={idx} className="flex gap-2 hover:bg-white/[0.02] py-0.5 px-1 rounded transition-colors">
                  <span className="text-gray-600 shrink-0">{log.time}</span>
                  <span className={`font-bold shrink-0 ${
                    log.tag === 'CRITICAL' ? 'text-red-500' :
                    log.tag === 'HIGH'     ? 'text-orange-500' :
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
    </div>
  );
}
