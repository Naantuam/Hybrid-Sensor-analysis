import React from 'react';
import { Fingerprint } from 'lucide-react';

export default function FingerprintLogo({ 
  onClick, 
  isCollapsed = false,
  showLabel = true,
  title = "FORENSIC SENSOR MONITOR",
  subtitle = "Hybrid Intelligence & Threat Auditing",
  className = ""
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`group relative flex items-center gap-3 text-left focus:outline-none transition-all duration-300 cursor-pointer ${className}`}
      title={isCollapsed ? "Expand Sidebar (Forensic Sensor Monitor)" : "Collapse Sidebar"}
      aria-label="Toggle Sidebar"
    >
      {/* Fingerprint Icon Container with Biometric Scanner Effect */}
      <div className="relative flex items-center justify-center p-2.5 rounded-xl bg-gradient-to-br from-cyan-950/70 via-cyan-900/40 to-blue-950/90 border border-cyan-500/30 text-cyan-400 group-hover:border-cyan-400 group-hover:text-cyan-300 group-hover:shadow-[0_0_22px_rgba(6,182,212,0.6)] group-hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden flex-shrink-0">
        
        {/* Animated Biometric Scan Beam */}
        <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_10px_#06b6d4] opacity-0 group-hover:opacity-100 group-hover:animate-scanbeam transition-opacity duration-300 pointer-events-none" />

        {/* Biometric Corner HUD elements */}
        <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-cyan-400/70 group-hover:border-cyan-300 transition-colors" />
        <div className="absolute top-1 right-1 w-1.5 h-1.5 border-t border-r border-cyan-400/70 group-hover:border-cyan-300 transition-colors" />
        <div className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b border-l border-cyan-400/70 group-hover:border-cyan-300 transition-colors" />
        <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-cyan-400/70 group-hover:border-cyan-300 transition-colors" />

        {/* Fingerprint Icon */}
        <Fingerprint className="w-5 h-5 transform group-hover:scale-110 transition-transform duration-300 filter drop-shadow-[0_0_6px_rgba(6,182,212,0.7)]" />
        
        {/* Glowing Pulsing Beacon Dot */}
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-400 rounded-full animate-ping opacity-75" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_6px_#06b6d4]" />
      </div>

      {/* Label and Subtitle when expanded */}
      {showLabel && !isCollapsed && (
        <div className="overflow-hidden transition-all duration-300">
          <h1 className="font-outfit font-extrabold text-xs tracking-wider bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-blue-300 transition-all">
            {title}
          </h1>
          <p className="text-[9px] text-cyan-500/80 tracking-wider uppercase font-semibold truncate group-hover:text-cyan-400 transition-colors">
            {subtitle}
          </p>
        </div>
      )}
    </button>
  );
}
