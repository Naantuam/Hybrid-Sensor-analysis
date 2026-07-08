import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Cpu, CheckCircle2, Terminal, Copy, Check, 
  RefreshCw, Download, Info, ExternalLink, ShieldAlert, Radio
} from 'lucide-react';

export default function DeviceRegister() {
  const [serverInfo, setServerInfo] = useState({ localIp: '', port: 4444, bootstrapUrl: '' });
  const [detectedDevices, setDetectedDevices] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('modern'); // 'modern', 'legacy', 'x86_64'
  const [useAutoDetect, setUseAutoDetect] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch Server Metadata
  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => {
        setServerInfo(data);
      })
      .catch(err => console.error('[!] Error fetching server info:', err));
  }, []);

  // Poll USB/ADB devices
  useEffect(() => {
    let timer;
    const checkUsb = () => {
      fetch('/api/usb-detect')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setDetectedDevices(data.devices || []);
            if (data.devices && data.devices.length > 0 && useAutoDetect) {
              setSelectedProfile(data.devices[0].profile);
            }
          }
        })
        .catch(err => console.error('[!] Error checking USB devices:', err));
    };

    checkUsb();
    timer = setInterval(checkUsb, 3000);

    return () => clearInterval(timer);
  }, [useAutoDetect]);

  const activeBootstrapUrl = serverInfo.bootstrapUrl 
    ? `${serverInfo.bootstrapUrl}?profile=${selectedProfile}`
    : '';

  const copyCommand = () => {
    if (!activeBootstrapUrl) return;
    const cmd = `curl -s "${activeBootstrapUrl}" | bash`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProfileLabel = (prof) => {
    switch (prof) {
      case 'legacy': return 'Legacy Environment (Android 7 - 9)';
      case 'x86_64': return 'Emulator Environment (x86_64 / VM)';
      default: return 'Modern Environment (Android 10 - 14+)';
    }
  };

  // Generate QR Code URL from a clean public API with matching dark theme styling
  const qrCodeUrl = activeBootstrapUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&color=06b6d4&bgcolor=0b0c15&data=${encodeURIComponent(activeBootstrapUrl)}`
    : '';

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto p-4">
      {/* HEADER SECTION */}
      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold font-outfit text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            Device Onboarding Operations
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Register new endpoints to stream live telemetry logs into the Forensic Analysis center.
          </p>
        </div>
        <div className="flex flex-col text-xs font-mono bg-black/40 border border-white/5 rounded-xl px-4 py-2.5">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">SERVER IP:</span>
            <span className="text-cyan-400 font-bold">{serverInfo.localIp || 'Detecting...'}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/[0.03] mt-1 pt-1">
            <span className="text-gray-500">LISTEN PORT:</span>
            <span className="text-white font-bold">{serverInfo.port || 4444}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: DETECTION & PROFILE SELECTION */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* USB AUTO-DETECTION MODULE */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                1. Device Interface Detection
              </h3>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping`} />
                <span className="text-[9px] text-cyan-400 font-mono font-bold">ADB_LISTEN</span>
              </div>
            </div>

            {/* Toggle switch auto detect */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Use USB Auto-detection</span>
              <button 
                onClick={() => setUseAutoDetect(!useAutoDetect)}
                className={`w-10 h-5 rounded-full transition-colors relative ${useAutoDetect ? 'bg-cyan-500' : 'bg-white/10'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${useAutoDetect ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {useAutoDetect ? (
              <div className="space-y-3">
                {detectedDevices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-black/30 rounded-xl border border-white/[0.02] text-center space-y-3">
                    <RefreshCw className="w-6 h-6 text-gray-600 animate-spin" />
                    <div className="text-[10px] text-gray-500 font-mono">
                      Awaiting USB debug connection...<br/>
                      <span className="text-[9px] text-gray-600">(Enable USB Debugging on phone)</span>
                    </div>
                  </div>
                ) : (
                  detectedDevices.map((device, idx) => (
                    <div key={idx} className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-white truncate">{device.model}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-[10px] font-mono text-gray-400">
                        <span>Android:</span> <span className="text-white">{device.androidVersion} (API {device.sdkLevel})</span>
                        <span>Arch:</span> <span className="text-white">{device.abi}</span>
                        <span>Serial:</span> <span className="text-gray-500 truncate max-w-[90px]">{device.serial}</span>
                      </div>
                      <div className="text-[9px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/15 rounded px-2 py-1 font-mono text-center">
                        Selected Profile: {getProfileLabel(device.profile)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="bg-black/20 p-3.5 rounded-xl border border-white/[0.02] text-xs text-gray-400 space-y-2">
                <p>Auto-detection disabled. Please manually select the target environment profile below.</p>
              </div>
            )}
          </div>

          {/* PROFILE SELECTOR (MANUAL OR FALLBACK) */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-2 border-b border-white/5">
              2. Target Environment Profile
            </h3>
            
            <div className="space-y-2.5">
              {['modern', 'legacy', 'x86_64'].map(prof => (
                <div 
                  key={prof}
                  onClick={() => {
                    setSelectedProfile(prof);
                    if (useAutoDetect) setUseAutoDetect(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedProfile === prof 
                      ? 'bg-cyan-500/5 border-cyan-500/35 text-cyan-400' 
                      : 'bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  <div className="font-semibold text-xs">{getProfileLabel(prof)}</div>
                  <div className="text-[9px] text-gray-500 mt-1">
                    {prof === 'modern' && 'Optimized for Android 10, 11, 12, 13, and 14+.'}
                    {prof === 'legacy' && 'Backwards compatibility for Android 7, 8, and 9.'}
                    {prof === 'x86_64' && 'Configured for x86/x86_64 virtual devices (AVD).'}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* MIDDLE & RIGHT COLUMNS: INSTALLATION STEPS AND QR CODE / COMMANDS */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* DEPLOYMENT PANEL */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md space-y-6">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-3 border-b border-white/5">
              3. Telemetry Agent Provisioning Command
            </h3>

            <div className="flex flex-col md:flex-row gap-8 items-center">
              
              {/* QR Code Container */}
              <div className="flex-shrink-0 bg-[#0b0c15] p-3 rounded-2xl border border-white/5 shadow-inner">
                {qrCodeUrl ? (
                  <img 
                    src={qrCodeUrl} 
                    alt="Provisioning QR Code" 
                    className="w-[200px] h-[200px] rounded-lg block border border-cyan-500/10" 
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-gray-600 font-mono bg-[#0d0e1b] rounded-lg">
                    Generating...
                  </div>
                )}
              </div>

              {/* Terminal command container */}
              <div className="flex-1 space-y-4 w-full">
                <p className="text-xs text-gray-400 leading-relaxed">
                  Scan this QR code in Termux (using an external scanner or by loading the URL) OR paste the console bootstrap hook directly into your Termux CLI terminal.
                </p>

                <div className="bg-black/60 border border-white/5 rounded-xl p-4 font-mono text-[10.5px] text-cyan-400 relative overflow-x-auto whitespace-pre">
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.03] mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-gray-500 text-[9px] uppercase tracking-wider font-bold">Termux Bootstrap command</span>
                    </div>
                    <button
                      onClick={copyCommand}
                      className="p-1 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <code className="text-gray-300">
                    curl -s "{activeBootstrapUrl}" | bash
                  </code>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-cyan-400 bg-cyan-950/20 border border-cyan-900/30 rounded-lg p-3">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>This bootstrapping command automatically sets up the environment workspace, installs dependencies, fetches target-aware configurations, and stages permissions check.</span>
                </div>
              </div>

            </div>
          </div>

          {/* STEP BY STEP CHECKLIST */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md space-y-6">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-3 border-b border-white/5">
              4. Endpoint Configuration Blueprint
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Step 1 */}
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    01
                  </div>
                  <h4 className="font-bold text-xs text-white">Environment Prerequisites</h4>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed pl-9">
                  Download **Termux** and the **Termux:API** plugins. Make sure to download the versions hosted on F-Droid, as the legacy Play Store packages will throw permission and library dependency errors.
                </p>
                <div className="pt-2 pl-9 flex gap-3">
                  <a 
                    href="https://f-droid.org/en/packages/com.termux/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                  >
                    Termux F-Droid <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <a 
                    href="https://f-droid.org/en/packages/com.termux.api/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                  >
                    Termux:API <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    02
                  </div>
                  <h4 className="font-bold text-xs text-white">Execute Onboarding Hook</h4>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed pl-9">
                  Run the copyable curl bootstrap statement in your Termux command line. The script installs Node.js, fetches the parser configs, copies our custom execution daemons, and prepares the npm packages.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    03
                  </div>
                  <h4 className="font-bold text-xs text-white">Grant Security Exemptions</h4>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed pl-9">
                  During `setup.sh`, verify the notification overlay prompt. Ensure you set the Termux app to **Unrestricted** battery usage inside Android system settings, preventing background sleep termination.
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    04
                  </div>
                  <h4 className="font-bold text-xs text-white">Deploy Telemetry Daemon</h4>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed pl-9">
                  In Termux, start the monitoring cycle:
                  <code className="block mt-1.5 p-2 bg-black/40 border border-white/5 rounded font-mono text-cyan-400 text-[10px] text-center">
                    bash start_agent.sh
                  </code>
                  Telemetry logs will immediately stream to the active sessions sidebar monitor.
                </p>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
