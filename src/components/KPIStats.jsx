import React from 'react';
import { Battery } from 'lucide-react';

export default function KPIStats({ kpis, selectedSession }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
        <p className="text-[0.5625rem] text-gray-500 uppercase tracking-widest font-bold mb-1">Max Risk Rating</p>
        <h3 className="text-3xl font-bold font-outfit text-red-500 font-mono">{kpis.max_score || 0} <span className="text-xs text-gray-600">PTS</span></h3>
        <p className="text-xs text-gray-500 mt-2">Highest alert severity recorded</p>
      </div>
      
      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />
        <p className="text-[0.5625rem] text-gray-500 uppercase tracking-widest font-bold mb-1">Threat Alarms</p>
        <h3 className="text-3xl font-bold font-outfit text-orange-400 font-mono">{kpis.total_threats || 0}</h3>
        <p className="text-xs text-gray-500 mt-2">Identified non-benign patterns</p>
      </div>

      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500" />
        <p className="text-[0.5625rem] text-gray-500 uppercase tracking-widest font-bold mb-1">Total Packets</p>
        <h3 className="text-3xl font-bold font-outfit text-cyan-400 font-mono">{kpis.total_events || 0}</h3>
        <p className="text-xs text-gray-500 mt-2">Physical sensor updates processed</p>
      </div>

      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500" />
        <p className="text-[0.5625rem] text-gray-500 uppercase tracking-widest font-bold mb-1">Power Optimization</p>
        <h3 className="text-3xl font-bold font-outfit text-yellow-400 flex items-center gap-2 font-mono">
          <Battery className="w-6 h-6 animate-pulse" />
          {selectedSession?.battery_saver_active ? 'ACTIVE' : 'INACTIVE'}
        </h3>
        <p className="text-xs text-gray-500 mt-2">Battery saver throttling status</p>
      </div>
    </div>
  );
}
