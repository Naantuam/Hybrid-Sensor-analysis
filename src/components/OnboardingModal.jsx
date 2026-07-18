import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Cpu, CheckCircle2, Terminal, Copy, Check, 
  RefreshCw, Download, Info, ExternalLink, ShieldAlert, Radio,
  Play, Square, Loader2, X, AlertTriangle, Network
} from 'lucide-react';

export default function OnboardingModal({ isOpen, onClose, onRegisterSuccess }) {
  const [serverInfo, setServerInfo] = useState({ localIp: '', port: 4444, bootstrapUrl: '' });
  const [detectedDevices, setDetectedDevices] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('modern'); // 'modern', 'x86_64'
  const [copied, setCopied] = useState(false);
  
  // Scan / Bridge States
  const [isScanning, setIsScanning] = useState(false);
  const [runningSerials, setRunningSerials] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Automated USB Provisioner States
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState('');

  // Registration options
  const [registrationMode, setRegistrationMode] = useState('full'); // 'full' (Termux + Internet), 'adb' (ADB Bridge only)

  // Wireless Handoff Wizard States
  const [wirelessHandoffStep, setWirelessHandoffStep] = useState(0); // 0=ready, 1=preparing, 2=unplug_usb_prompt, 3=connecting, 4=success, 5=unauthorized
  const [resolvedIp, setResolvedIp] = useState('');

  // Fetch Server Metadata
  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

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
      body: JSON.stringify({ 
        serial: device.serial,
        connectionType: device.serial.includes(':') ? 'wireless_adb' : 'usb_adb'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        fetchRunningAgents();
        if (onRegisterSuccess) onRegisterSuccess();
      }
    })
    .catch(err => console.error('[!] Error toggling bridge agent:', err));
  };

  const handlePrepareWireless = (device) => {
    setWirelessHandoffStep(1);
    setProvisionStatus('Resolving handset IP and enabling TCP port 5555...');
    
    fetch('/api/agent/prepare-wireless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: device.serial })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        setResolvedIp(data.ip);
        setWirelessHandoffStep(2);
        setProvisionStatus(`TCP Mode Active! resolved IP: ${data.ip}`);
      } else {
        setWirelessHandoffStep(0);
        setProvisionStatus('');
        alert(data.message || 'Failed to prepare wireless target.');
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
    setProvisionStatus(`Connecting to wireless link: ${resolvedIp}...`);
    
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
          setProvisionStatus(`Paired wirelessly to ${resolvedIp}!`);
          handleScan();
          if (onRegisterSuccess) onRegisterSuccess();
        } else if (data.deviceStatus === 'unauthorized') {
          setWirelessHandoffStep(5);
          setProvisionStatus('Unauthorized! Approve the debugging popup on your phone.');
        } else {
          setWirelessHandoffStep(0);
          setProvisionStatus('');
          alert(`Handset returned state: ${data.deviceStatus || 'offline'}. Make sure it is connected to the same network.`);
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
        if (onRegisterSuccess) onRegisterSuccess();
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

  const getProfileLabel = (prof) => {
    switch (prof) {
      case 'x86_64': return 'AVD Emulator (x86_64)';
      default: return 'Modern (Android 10 - 14+)';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#040407]/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-[#0d0e17] border border-cyan-500/20 rounded-2xl shadow-[0_15px_50px_-15px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col z-10 animate-scaleIn max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-outfit text-white">Device Onboarding Portal</h2>
              <p className="text-xs text-gray-400 mt-0.5">Scan, register, and configure security telemetry targets on this system</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Quick Stats / Scan Trigger */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/[0.01] border border-white/5 rounded-xl p-4">
            <div>
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Target Scan Control</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Detect physical handsets connected over USB debug bridge</p>
            </div>
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white text-xs font-bold rounded-xl transition-all shadow-md"
            >
              {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isScanning ? "Scanning USB..." : "Scan USB Devices"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Device List */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-1">
                Detected Handsets ({detectedDevices.length})
              </h4>
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {detectedDevices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-black/20 rounded-xl border border-white/[0.02] text-center space-y-3">
                    <Smartphone className="w-8 h-8 text-gray-700" />
                    <div className="text-[10px] text-gray-500 font-mono">
                      No USB-ADB devices found.<br/>
                      Ensure USB Debugging is active on your target handset.
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
                        className={`border rounded-xl p-3.5 space-y-2.5 cursor-pointer transition-all ${
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

                        <div className="grid grid-cols-2 gap-y-1 text-[9px] font-mono text-gray-400">
                          <span>Android:</span> <span className="text-white">{device.androidVersion} (API {device.sdkLevel})</span>
                          <span>Arch:</span> <span className="text-white">{device.abi}</span>
                          <span>Serial:</span> <span className="text-gray-500 truncate max-w-24">{device.serial}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Setup & Onboarding Wizard */}
            <div className="lg:col-span-3 space-y-4">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-1">
                Setup Configurations
              </h4>

              {selectedDevice ? (
                <div className="space-y-4">
                  {/* Mode Selector */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3">
                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">1. Choose Registration Method</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setRegistrationMode('full')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          registrationMode === 'full' 
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                            : 'bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className="font-semibold text-xs block">Termux Agent</span>
                        <span className="text-[9px] text-gray-500 leading-none">Automated script setup over USB. Supports network failovers.</span>
                      </button>
                      
                      <button
                        onClick={() => setRegistrationMode('adb')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          registrationMode === 'adb' 
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                            : 'bg-white/[0.01] border-white/5 text-gray-400 hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className="font-semibold text-xs block">ADB Bridge Only</span>
                        <span className="text-[9px] text-gray-500 leading-none">Local Kali bridge logs hardware events without internet.</span>
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Wizard Steps */}
                  {registrationMode === 'full' ? (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">2. Termux Agent USB setup</span>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        This installs packages, security scripts, and dependencies on the target phone directly from the server. Tap the button below to provision.
                      </p>

                      <div className="flex gap-3 items-center">
                        <button
                          onClick={() => handleProvision(selectedDevice)}
                          disabled={isProvisioning}
                          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-all"
                        >
                          {isProvisioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Run Automated Auto-Setup
                        </button>
                      </div>

                      {provisionStatus && (
                        <div className="bg-[#05060b] border border-white/5 rounded-lg p-2.5 font-mono text-[9px] text-cyan-400 break-all">
                          {provisionStatus}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">2. Wireless & USB Bridge Control</span>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        ADB Bridge allows auditing hardware events by establishing a direct connection. If you want to use wireless connection:
                      </p>

                      {/* Wireless step logic */}
                      {selectedDevice.serial.includes(':') ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-semibold">Active Wireless Link Detected ({selectedDevice.serial})</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide block">Wireless TCP setup wizard:</span>
                          {wirelessHandoffStep === 0 && (
                            <button
                              onClick={() => handlePrepareWireless(selectedDevice)}
                              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-all"
                            >
                              Step A: Enable Wireless Mode
                            </button>
                          )}
                          {wirelessHandoffStep === 1 && (
                            <button disabled className="px-3.5 py-1.5 bg-cyan-800 text-cyan-400 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Configuring TCP port...
                            </button>
                          )}
                          {wirelessHandoffStep === 2 && (
                            <div className="space-y-2 animate-fadeIn">
                              <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 p-2 rounded-lg">
                                ⚠️ Disconnect the physical USB cable now, then click "Connect Wi-Fi" below.
                              </div>
                              <button
                                onClick={handleConnectWireless}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
                              >
                                Step B: Connect Wi-Fi ({resolvedIp})
                              </button>
                            </div>
                          )}
                          {wirelessHandoffStep === 3 && (
                            <button disabled className="px-3.5 py-1.5 bg-emerald-800 text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Pairing...
                            </button>
                          )}
                          {wirelessHandoffStep === 4 && (
                            <div className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                              ✓ Successfully Connected wirelessly! Resetting connection wizard.
                            </div>
                          )}
                          {wirelessHandoffStep === 5 && (
                            <div className="space-y-2">
                              <div className="text-[10px] text-amber-400 bg-amber-500/10 p-2.5 rounded-lg">
                                ⚠️ Check your phone's screen and authorize debugging from this computer!
                              </div>
                              <div className="flex gap-2">
                                <button onClick={handleConnectWireless} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-lg text-white">Retry Connection</button>
                                <button onClick={() => setWirelessHandoffStep(0)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs font-bold rounded-lg text-gray-400">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="border-t border-white/5 pt-3.5 space-y-2">
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide block">ADB Bridge Status:</span>
                        <div className="flex items-center justify-between bg-black/30 border border-white/5 p-3 rounded-lg">
                          <span className="text-xs font-semibold text-white">
                            Bridge Session Status: {runningSerials.includes(selectedDevice.serial) ? "RUNNING" : "STOPPED"}
                          </span>
                          <button
                            onClick={() => toggleAgent(selectedDevice)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                              runningSerials.includes(selectedDevice.serial) 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}
                          >
                            {runningSerials.includes(selectedDevice.serial) ? (
                              <><Square className="w-3 h-3 fill-current" /> STOP BRIDGE</>
                            ) : (
                              <><Play className="w-3 h-3 fill-current" /> START BRIDGE</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Device registration details */}
                  <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3.5 space-y-2">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">Registered Device Specifications</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex justify-between border-b border-white/[0.03] pb-1">
                        <span className="text-gray-500">Device model:</span>
                        <span className="font-semibold text-white font-mono">{selectedDevice.model}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/[0.03] pb-1">
                        <span className="text-gray-500">Serial ID:</span>
                        <span className="font-semibold text-white font-mono truncate max-w-24">{selectedDevice.serial}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/[0.03] pb-1">
                        <span className="text-gray-500">Architecture:</span>
                        <span className="font-semibold text-white font-mono">{selectedDevice.abi}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/[0.03] pb-1">
                        <span className="text-gray-500">Android/API:</span>
                        <span className="font-semibold text-white font-mono">{selectedDevice.androidVersion} (API {selectedDevice.sdkLevel})</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-black/20 rounded-xl border border-white/5 text-center space-y-3">
                  <Smartphone className="w-10 h-10 text-gray-700" />
                  <p className="text-xs text-gray-400">Please scan and select a device from the left panel to register or manage setup.</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-[#090a10] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold rounded-xl border border-white/5 transition-all"
          >
            Close Portal
          </button>
        </div>
      </div>
    </div>
  );
}
