import React, { useEffect, useRef } from 'react';

export default function LiveConsole({ liveLogs }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [liveLogs]);

  return (
    <div className="bg-[#05060b] border border-white/5 rounded-2xl p-6 backdrop-blur-md h-[calc(100vh-13.125rem)] flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <h3 className="font-extrabold font-outfit text-base text-white">Live System Logs</h3>
        </div>
        <span className="text-[0.625rem] font-mono text-gray-500 uppercase tracking-widest">ws_broker_active</span>
      </div>
      
      <div 
        ref={containerRef}
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
  );
}
