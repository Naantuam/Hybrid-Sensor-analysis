import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Cpu, CheckCircle2, Terminal, Copy, Check, 
  RefreshCw, Download, Info, ExternalLink, ShieldAlert, Radio,
  Play, Square, Loader2, Menu
} from 'lucide-react';

export default function DeviceRegister({ toggleSidebar }) {
  const [serverInfo, setServerInfo] = useState({ localIp: '', port: 4444, bootstrapUrl: '' });
  const [detectedDevices, setDetectedDevices] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('modern'); // 'modern', 'legacy', 'x86_64'
  const [copied, setCopied] = useState(false);
  
  // Custom Scan / Bridge States
  const [isScanning, setIsScanning] = useState(false);
  const [runningSerials, setRunningSerials] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Automated USB Provisioner States
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState('');

  // Fetch Server Metadata
  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => {
        setServerInfo(data);
      })
      .catch(err => console.error('[!] Error fetching server info:', err));

    handleScan();
    
    // Periodically sync running agents
    const timer = setInterval(fetchRunningAgents, 3000);
    return () => clearInterval(timer);
  }, []);

  const fetchRunningAgents = () => {
    fetch('/api/agent/status')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setRunningSerials(data.activeSerials || []);
        }
      })
      .catch(err => console.error('[!] Error syncing active agents:', err));
  };

  const handleScan = () => {
    setIsScanning(true);
    fetch('/api/usb-detect')
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        if (data.status === 'success') {
          setDetectedDevices(data.devices || []);
          if (data.devices && data.devices.length > 0) {
            setSelectedDevice(data.devices[0]);
            setSelectedProfile(data.devices[0].profile);
          } else {
            setSelectedDevice(null);
          }
        }
      })
      .catch(err => {
        setIsScanning(false);
        console.error('[!] Error checking USB devices:', err);
      });
    fetchRunningAgents();
  };

  const toggleAgent = (device) => {
    const isRunning = runningSerials.includes(device.serial);
    const endpoint = isRunning ? '/api/agent/stop' : '/api/agent/start';
    
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ serial: device.serial })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        fetchRunningAgents();
      }
    })
    .catch(err => console.error('[!] Error toggling bridge agent:', err));
  };

  const handleProvision = (device) => {
    setIsProvisioning(true);
    setProvisionStatus(`Initializing USB provisioning for ${device.model}...`);
    fetch('/api/agent/provision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ serial: device.serial })
    })
    .then(res => res.json())
    .then(data => {
      setIsProvisioning(false);
      if (data.status === 'success') {
        setProvisionStatus(`Success: Device ${device.model} preconfigured!`);
        alert(`Device ${device.model} successfully provisioned!`);
      } else {
        setProvisionStatus(`Error: ${data.error}`);
        alert(`Provisioning failed: ${data.error}`);
      }
    })
    .catch(err => {
      setIsProvisioning(false);
      setProvisionStatus('Network error occurred.');
      console.error('[!] Provisioning error:', err);
    });
  };

  const activeBootstrapUrl = serverInfo.bootstrapUrl 
    ? `${serverInfo.bootstrapUrl}?profile=${selectedProfile}` + (selectedDevice ? `&serial=${selectedDevice.serial}` : '')
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
      case 'legacy': return 'Legacy (Android 7 - 9)';
      case 'x86_64': return 'AVD Emulator (x86_64)';
      default: return 'Modern (Android 10 - 14+)';
    }
  };

  // QR Code URL matching theme styling
  const qrCodeUrl = activeBootstrapUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&color=06b6d4&bgcolor=0b0c15&data=${encodeURIComponent(activeBootstrapUrl)}`
    : '';

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto p-4">
      {/* HEADER SECTION */}
      <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-4 md:p-6 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start gap-3">
          {/* Hamburger Menu Toggler on Mobile */}
          <button
            onClick={toggleSidebar}
            className="md:hidden mt-1 p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold font-outfit text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
              Device Onboarding & Scanning Center
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Perform automatic scans, view physical USB attributes, and register agents using Termux QR codes or Host-side ADB bridges.
            </p>
          </div>
        </div>
        
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-cyan-950/20"
        >
          {isScanning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Scan USB Devices
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: SCANNED DEVICES */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-2 border-b border-white/5">
              1. Detected Handsets
            </h3>

            <div className="space-y-3">
              {detectedDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 bg-black/30 rounded-xl border border-white/[0.02] text-center space-y-3">
                  <Smartphone className="w-8 h-8 text-gray-700" />
                  <div className="text-[0.625rem] text-gray-500 font-mono">
                    No USB-ADB devices found.<br/>
                    Click "Scan USB Devices" above or ensure USB Debugging is enabled.
                  </div>
                </div>
              ) : (
                detectedDevices.map((device, idx) => {
                  const isSelected = selectedDevice?.serial === device.serial;
                  const isBridgeRunning = runningSerials.includes(device.serial);

                  return (
                    <div 
                      key={idx} 
                      onClick={() => {
                        setSelectedDevice(device);
                        setSelectedProfile(device.profile);
                      }}
                      className={`border rounded-xl p-4 space-y-3 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-cyan-500/5 border-cyan-500/30' 
                          : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Smartphone className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-gray-400'}`} />
                          <span className="text-xs font-bold text-white truncate max-w-28">{device.model}</span>
                        </div>
                        {isBridgeRunning && (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-y-1 text-[0.625rem] font-mono text-gray-400">
                        <span>Android:</span> <span className="text-white">{device.androidVersion} (API {device.sdkLevel})</span>
                        <span>Arch:</span> <span className="text-white">{device.abi}</span>
                        <span>Serial:</span> <span className="text-gray-500 truncate max-w-24">{device.serial}</span>
                      </div>

                      {/* Onboarding triggers */}
                      <div className="pt-2 flex flex-col gap-2 border-t border-white/5">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAgent(device);
                            }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.5625rem] font-mono font-bold transition-all ${
                              isBridgeRunning 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}
                          >
                            {isBridgeRunning ? (
                              <>
                                <Square className="w-3 h-3 fill-current" />
                                STOP BRIDGE
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" />
                                START BRIDGE
                              </>
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProvision(device);
                            }}
                            disabled={isProvisioning}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.5625rem] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                          >
                            <Download className="w-3 h-3" />
                            AUTO-SETUP
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* TARGET ENVIRONMENT PROFILE SELECTOR */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-2 border-b border-white/5">
              2. Manual Profile Overrides
            </h3>
            
            <div className="space-y-2">
              {['modern', 'legacy', 'x86_64'].map(prof => (
                <div 
                  key={prof}
                  onClick={() => setSelectedProfile(prof)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedProfile === prof 
                      ? 'bg-cyan-500/5 border-cyan-500/35 text-cyan-400' 
                      : 'bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="font-semibold text-xs">{getProfileLabel(prof)}</div>
                  <div className="text-[0.5625rem] text-gray-500 mt-1">
                    {prof === 'modern' && 'Targeting Android 10, 11, 12, 13, and 14+.'}
                    {prof === 'legacy' && 'Targeting Android 7, 8, and 9.'}
                    {prof === 'x86_64' && 'Targeting x86/x86_64 virtual emulator images.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MIDDLE/RIGHT COLUMNS: TARGETED ONBOARDING */}
        <div className="lg:col-span-2 space-y-6">
          
          {selectedDevice ? (
            <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-4 md:p-8 backdrop-blur-md space-y-6">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                  3. Onboarding Portal for {selectedDevice.model}
                </h3>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                
                {/* Provisioning Status Visualizer */}
                <div className="flex-shrink-0 bg-[#0b0c15] p-6 rounded-2xl border border-white/5 shadow-inner w-full md:w-56 h-56 flex flex-col items-center justify-center text-center space-y-3">
                  {isProvisioning ? (
                    <>
                      <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                      <div className="text-[0.625rem] text-cyan-300 font-mono">Provisioning Workspace...</div>
                    </>
                  ) : provisionStatus.startsWith('Success') ? (
                     <>
                       <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                       <div className="text-[0.625rem] text-emerald-300 font-mono">Device Preconfigured!</div>
                     </>
                  ) : (
                    <>
                      <Smartphone className="w-10 h-10 text-cyan-500/50" />
                      <div className="text-[0.625rem] text-gray-500 font-mono">Ready for USB Setup</div>
                    </>
                  )}
                  {provisionStatus && (
                    <div className="text-[0.5625rem] text-gray-400 font-mono max-w-44 truncate">{provisionStatus}</div>
                  )}
                </div>

                {/* Text and commands */}
                <div className="flex-1 space-y-4 w-full">
                  <div className="text-xs text-gray-300 space-y-2">
                    <span className="font-bold text-white block">A. Automated Host-Side USB Setup (Recommended)</span>
                    <p className="text-gray-400 leading-relaxed">
                      Configure the device completely over the USB cable without typing on the screen. The server will detect its CPU architecture, push the correct Termux packages, and extract them.
                    </p>
                    <button
                      onClick={() => handleProvision(selectedDevice)}
                      disabled={isProvisioning}
                      className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white text-xs font-bold rounded-xl transition-all shadow-md"
                    >
                      {isProvisioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Run Automated USB Setup
                    </button>
                  </div>

                  <div className="text-xs text-gray-300 space-y-2 pt-4 border-t border-white/5">
                    <span className="font-bold text-white block">B. USB ADB Host Bridge Mode</span>
                    <p className="text-gray-400 leading-relaxed">
                      No Termux setup needed! Toggle the **START BRIDGE** action in the device list. The edge server will run the telemetry agent directly on this host machine, connecting to your handset via ADB.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-4 md:p-8 backdrop-blur-md text-center py-20 space-y-3">
              <Smartphone className="w-12 h-12 text-gray-700 mx-auto" />
               <p className="text-sm text-gray-400">Please scan for connected USB devices and select a handset to begin onboarding.</p>
            </div>
          )}

          {/* BLUEPRINT STEPS */}
          <div className="bg-[#10111a]/60 border border-white/5 rounded-2xl p-4 md:p-8 backdrop-blur-md space-y-6">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest pb-3 border-b border-white/5">
              4. Registration Blueprint & Prerequisites
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    01
                  </div>
                  <h4 className="font-bold text-xs text-white">Enable Developer Options</h4>
                </div>
                <p className="text-[0.6875rem] text-gray-400 leading-relaxed pl-9">
                  On the mobile device, navigate to **Settings** &gt; **About Phone** and tap **Build Number** 7 times. Open **Developer Options** and enable **USB Debugging**.
                </p>
              </div>

              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    02
                  </div>
                  <h4 className="font-bold text-xs text-white">Trust Host Machine</h4>
                </div>
                <p className="text-[0.6875rem] text-gray-400 leading-relaxed pl-9">
                  Connect the phone to the host PC via USB. On the phone, accept the authorization prompt to **Allow USB Debugging** from this computer.
                </p>
              </div>

              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    03
                  </div>
                  <h4 className="font-bold text-xs text-white">Configure Battery Settings</h4>
                </div>
                <p className="text-[0.6875rem] text-gray-400 leading-relaxed pl-9">
                  If using Termux Local mode, configure the Termux app battery usage setting to **Unrestricted** to prevent the background telemetry loop from going to sleep.
                </p>
              </div>

              <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs">
                    04
                  </div>
                  <h4 className="font-bold text-xs text-white">Verify Telemetry Stream</h4>
                </div>
                <p className="text-[0.6875rem] text-gray-400 leading-relaxed pl-9">
                  Once onboarding is complete (either Termux setup script finishes or host bridge starts), navigate to the **Security Monitor** view to inspect telemetry alerts.
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
