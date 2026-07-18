// Isolated CLI Commands and Parsers for Android Telemetry Agent

const SYSTEM_PREFIXES = [
    'com.android', 
    'com.google.android', 
    'com.sec.android', 
    'com.samsung', 
    'org.chromium', 
    'com.huawei', 
    'com.lg', 
    'com.xiaomi', 
    'com.oppo'
];

/**
 * Filter list of active accessibility packages to identify custom/non-system plugins
 */
function getSuspiciousAccessibilityServices(packages) {
    if (!packages || !Array.isArray(packages)) return [];
    return packages.filter(pkg => {
        return !SYSTEM_PREFIXES.some(prefix => pkg.startsWith(prefix));
    });
}

const commands = {
    sensorservice: {
        shellCommand: "dumpsys sensorservice",
        description: "Audits active Android SensorManager subscribers and their foreground/background state",
        parse: (stdout) => {
            const appsList = [];
            const lines = stdout.split('\n');
            let inConnectionsSection = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Detect start of connections section (case-insensitive for MTK and standard variants)
                if (line.toLowerCase().includes('active connections') || line.toLowerCase().includes('active connection')) {
                    inConnectionsSection = true;
                    continue;
                }

                // Detect section boundaries
                if (line.includes('Previous Registrations') || line.includes('0 direct connections')) {
                    inConnectionsSection = false;
                }

                if (inConnectionsSection) {
                    // Layout 1: Multi-line MediaTek/Infinix format
                    if (line.toLowerCase().startsWith('connection number:')) {
                        const packageLine = lines[i + 1] ? lines[i + 1].trim() : '';
                        const sensorLine = lines[i + 2] ? lines[i + 2].trim() : '';

                        if (packageLine && sensorLine) {
                            const pkgParts = packageLine.split('|');
                            const pkgName = pkgParts[0].trim();
                            const uidMatch = packageLine.match(/uid\s+(\d+)/) || packageLine.match(/uid:?\s*(\d+)/);

                            const sensorParts = sensorLine.split('|');
                            const sensorMatch = sensorParts[0].match(/^([\w\s]+)(?=\s+0x|\s+\d)/) || [null, sensorParts[0].trim()];
                            const sensorName = sensorMatch[1] ? sensorMatch[1].trim() : sensorParts[0].trim();
                            const isActive = sensorLine.toLowerCase().includes('active');

                            if (isActive && pkgName && !pkgName.startsWith('Connection Number')) {
                                appsList.push({
                                    package: pkgName,
                                    sensor: sensorName,
                                    rate: 50,
                                    uid: uidMatch ? uidMatch[1] : "unknown",
                                    state: packageLine.includes('BACKGROUND') ? 'BACKGROUND' : 'FOREGROUND',
                                    screenOff: sensorLine.includes('ScreenOff') || packageLine.includes('ScreenOff'),
                                    foregroundService: packageLine.includes('ForegroundService'),
                                    proximityEngaged: sensorName.toLowerCase().includes('proximity')
                                });
                            }
                        }
                        i += 2; // Skip multi-line block
                    }
                    // Layout 2: Standard Android 10+ single-line format
                    else if (line.includes('|') && (line.toLowerCase().includes('sensor') || line.toLowerCase().includes('rate'))) {
                        const parts = line.split('|').map(p => p.trim());
                        if (parts.length >= 4) {
                            const pkgName = parts[1];
                            const status = parts[2];
                            const uidPart = parts[3];
                            
                            let sensorName = "Unknown";
                            let rateHz = 50;
                            let isScreenOff = line.includes('ScreenOff') || line.toLowerCase().includes('screenoff');
                            let isForegroundService = line.includes('ForegroundService') || line.toLowerCase().includes('foregroundservice');

                            parts.forEach(part => {
                                const partLower = part.toLowerCase();
                                if (partLower.startsWith('sensor:') || partLower.includes('sensor ')) {
                                    const match = part.match(/(?:sensor:?\s*)([^(\n]+)/i);
                                    if (match) sensorName = match[1].trim();
                                }
                                if (partLower.startsWith('rate:') || partLower.includes('rate ')) {
                                    const match = part.match(/(?:rate:?\s*)(\d+)/i);
                                    if (match) rateHz = parseInt(match[1]);
                                }
                            });

                            const uidMatch = uidPart.match(/uid:?\s*(\d+)/i) || line.match(/uid:?\s*(\d+)/i);
                            const isActive = status.toLowerCase().includes('active') || line.toLowerCase().includes('active');

                            if (isActive && pkgName && !pkgName.startsWith('0x') && pkgName !== 'Connection Number') {
                                appsList.push({
                                    package: pkgName,
                                    sensor: sensorName,
                                    rate: rateHz,
                                    uid: uidMatch ? uidMatch[1] : "unknown",
                                    state: line.includes('BACKGROUND') ? 'BACKGROUND' : 'FOREGROUND',
                                    screenOff: isScreenOff,
                                    foregroundService: isForegroundService,
                                    proximityEngaged: sensorName.toLowerCase().includes('proximity')
                                });
                            }
                        }
                    }
                }
            }
            return appsList;
        }
    },
    audio: {
        shellCommand: "dumpsys media.audio_policy && dumpsys audio",
        description: "Audits active microphone recording configurations to detect microphone usage",
        parse: (stdout, uidToPackageMap) => {
            const list = [];
            const lines = stdout.split('\n');
            const activeRecords = new Set();
            
            // 1. MediaTek/Infinix Transaction-based Recording State Parser
            const riidMap = new Map();
            
            // 2. Standard Android section trackers
            let inActiveRecordClients = false;
            let currentRecord = null;

            lines.forEach(line => {
                const trimmed = line.trim();
                const lower = trimmed.toLowerCase();

                // Parse MediaTek/Infinix log event records: e.g. "rec start riid:43711 uid:10224 session:44177 src:CAMCORDER pack:com.whatsapp"
                const matchEvent = trimmed.match(/rec\s+(start|stop|update)\s+riid:(\d+)\s+uid:(\d+)\s+session:\d+\s+src:\w+\s+pack:([\w\.]+)/i);
                if (matchEvent) {
                    const action = matchEvent[1].toLowerCase();
                    const riid = matchEvent[2];
                    const uid = matchEvent[3];
                    const pkgName = matchEvent[4];

                    if (action === 'start' || action === 'update') {
                        riidMap.set(riid, { uid, package: pkgName });
                    } else if (action === 'stop') {
                        riidMap.delete(riid);
                    }
                    return;
                }

                // Detect start of Active record clients section
                if (lower.includes('active record clients:') || lower.includes('active record client')) {
                    inActiveRecordClients = true;
                    return;
                }

                // Detect end of section by looking for other header patterns
                if (inActiveRecordClients && (trimmed.startsWith('-') && !trimmed.startsWith('- Session') && !trimmed.startsWith('- Session:'))) {
                    if (!lower.includes('session')) {
                        inActiveRecordClients = false;
                    }
                }

                // Parse standard session attributes
                if (inActiveRecordClients) {
                    if (lower.startsWith('session:') || lower.startsWith('- session:')) {
                        if (currentRecord && currentRecord.uid) {
                            activeRecords.add(JSON.stringify(currentRecord));
                        }
                        currentRecord = { uid: null, package: null };
                    }
                    
                    const uidMatch = trimmed.match(/uid:?\s*(\d+)/i) || trimmed.match(/uid\s+(\d+)/i);
                    if (uidMatch && currentRecord) {
                        currentRecord.uid = uidMatch[1];
                    }
                }

                // Support flat RecordActivity lists on some versions
                if (lower.includes('recordactivity') || lower.includes('rec start')) {
                    const uidMatch = trimmed.match(/uid:?\s*(\d+)/i) || trimmed.match(/uid\s+(\d+)/i);
                    const pkgMatch = trimmed.match(/(?:Client|client|package|pack|package=):\s*"?([\w\.]+)"?/i) ||
                                     trimmed.match(/(?:client|pack):\s*([\w\.]+)/i) ||
                                     trimmed.match(/package\s+([\w\.]+)/i);

                    if (uidMatch) {
                        activeRecords.add(JSON.stringify({
                            uid: uidMatch[1],
                            package: pkgMatch ? pkgMatch[1] : null
                        }));
                    }
                }
            });

            // Flush last standard parsed record
            if (inActiveRecordClients && currentRecord && currentRecord.uid) {
                activeRecords.add(JSON.stringify(currentRecord));
            }

            // Append all active transactions from MediaTek map to activeRecords
            riidMap.forEach(record => {
                activeRecords.add(JSON.stringify(record));
            });

            activeRecords.forEach((recordStr) => {
                const record = JSON.parse(recordStr);
                let pkgName = record.package;
                if (!pkgName && record.uid && uidToPackageMap) {
                    pkgName = uidToPackageMap.get(record.uid);
                }
                
                if (pkgName && pkgName !== "android" && pkgName !== "system") {
                    list.push({
                        package: pkgName,
                        uid: record.uid || "1000",
                        state: "FOREGROUND",
                        sensor: "Microphone",
                        rate: 1,
                        screenOff: false,
                        foregroundService: true,
                        proximityEngaged: false
                    });
                }
            });

            return list;
        }
    },
    camera: {
        shellCommand: "dumpsys media.camera",
        description: "Checks active clients connected to the camera hardware service",
        parse: (stdout) => {
            const list = [];
            if (!stdout) return list;
            const lines = stdout.split('\n');
            let isClientSection = false;

            lines.forEach(line => {
                const trimmed = line.trim();
                
                // Track start of clients section (Android 10+)
                if (trimmed.includes("Camera module authority clients:") || trimmed.includes("Active Camera Clients:")) {
                    isClientSection = true;
                    return;
                }
                // Stop scanning at section boundaries
                if (isClientSection && (trimmed.startsWith("Allowed user IDs:") || trimmed.startsWith("Device type:"))) {
                    isClientSection = false;
                }

                if (isClientSection) {
                    // Match pattern: Client "com.whatsapp" (API 29-35 formats)
                    const pkgMatch = trimmed.match(/Client\s+["']?([\w\.]+)["']?/i) ||
                                     trimmed.match(/client:\s*([\w\.]+)/i) ||
                                     trimmed.match(/Package\s+([\w\.]+)/i);
                                     
                    if (pkgMatch && pkgMatch[1] && pkgMatch[1] !== "android") {
                        list.push({
                            package: pkgMatch[1],
                            uid: "1000",
                            state: "FOREGROUND",
                            sensor: "Camera",
                            rate: 1,
                            screenOff: false,
                            foregroundService: true,
                            proximityEngaged: false
                        });
                    }
                }
            });
            return list;
        }
    },
    location: {
        shellCommand: "dumpsys location",
        description: "Checks GPS and location provider active request records",
        parse: (stdout) => {
            const list = [];
            if (!stdout) return list;
            const lines = stdout.split('\n');
            
            // Standard Android 10-15 Location Manager Provider line patterns
            lines.forEach(line => {
                const trimmed = line.trim();
                
                // Matches active location requests in dumpsys (Android 10-15: "request: WorkSource{10123 com.google.android.apps.maps}")
                // Matches legacy Android 10 layout: "UpdateRecord[gps com.whatsapp(10123)]"
                const wsMatch = trimmed.match(/WorkSource\{\s*(\d+)\s+([\w\.]+)\s*\}/);
                const urMatch = trimmed.match(/UpdateRecord\[\w+\s+([\w\.]+)\((\d+)\)/);
                const rcMatch = trimmed.match(/receiver:\s*([\w\.]+)\s*\(uid\s+(\d+)\)/);
                
                let pkgName = null;
                let uid = null;

                if (wsMatch) {
                    uid = wsMatch[1];
                    pkgName = wsMatch[2];
                } else if (urMatch) {
                    pkgName = urMatch[1];
                    uid = urMatch[2];
                } else if (rcMatch) {
                    pkgName = rcMatch[1];
                    uid = rcMatch[2];
                }
                                     
                if (pkgName && pkgName !== 'android' && pkgName !== 'system') {
                    list.push({
                        package: pkgName,
                        uid: uid || "unknown",
                        state: "FOREGROUND",
                        sensor: trimmed.toLowerCase().includes('gps') ? 'GPS_Location' : 'Network_Location',
                        rate: 1,
                        screenOff: false,
                        foregroundService: true,
                        proximityEngaged: false
                    });
                }
            });
            return list;
        }
    },
    bluetooth: {
        shellCommand: "dumpsys bluetooth_manager",
        description: "Queries active Bluetooth scanner configurations for GATT scan tracking",
        parse: (stdout) => {
            const list = [];
            const lines = stdout.split('\n');
            let inScannerMap = false;

            for (let line of lines) {
                const trimmed = line.trim();
                const lower = trimmed.toLowerCase();

                if (lower.includes('gatt scanner map')) {
                    inScannerMap = true;
                    continue;
                }
                
                // If we reach another header section, exit the scanner map scan
                if (inScannerMap && (trimmed.startsWith('==') || lower.includes('bluetooth status') || lower.includes('active services') || lower.includes('bonded devices:'))) {
                    inScannerMap = false;
                }

                if (inScannerMap) {
                    // Match pattern: "com.google.uid.shared:10132 (Registered)"
                    const match = trimmed.match(/^\s*([a-zA-Z][\w\.]+):(\d+)\s*\((Registered|Active)/i);
                    if (match) {
                        const pkgName = match[1];
                        const uid = match[2];
                        if (pkgName !== 'android' && pkgName !== 'system') {
                            list.push({
                                package: pkgName,
                                uid: uid,
                                state: "FOREGROUND",
                                sensor: "Bluetooth_Scan",
                                rate: 1,
                                screenOff: false,
                                foregroundService: true,
                                proximityEngaged: false
                            });
                        }
                    }
                }
            }
            return list;
        }
    },
    accessibility: {
        shellCommand: "settings get secure enabled_accessibility_services",
        description: "Lists active accessibility services monitoring the user interface",
        parse: (stdout) => {
            let accessibilityPackages = [];
            if (stdout && stdout.trim() !== "null" && stdout.trim() !== "") {
                const services = stdout.trim().split(':');
                services.forEach(service => {
                    const pkg = service.split('/')[0];
                    if (pkg) accessibilityPackages.push(pkg);
                });
            }
            return accessibilityPackages;
        }
    },
    power: {
        shellCommand: "dumpsys power",
        description: "Checks if the display power state is interactive (screen ON or OFF)",
        parse: (stdout) => {
            if (!stdout) return true; // Default fallback to ON
            if (stdout.includes('mInteractive=false')) return false;
            if (stdout.includes('mInteractive=true')) return true;
            if (stdout.includes('Display Power: state=OFF')) return false;
            if (stdout.includes('Display Power: state=ON')) return true;
            if (stdout.includes('mScreenOn=false')) return false;
            if (stdout.includes('mScreenOn=true')) return true;
            return true;
        }
    }
};

module.exports = {
    commands,
    SYSTEM_PREFIXES,
    getSuspiciousAccessibilityServices
};
