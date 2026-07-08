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
                    // Layout 2: Single-line legacy format
                    else {
                        const pkgMatch = line.match(/([\w\.]+)\s*\|\s*Sensor:\s*([\w\s]+)/);
                        if (pkgMatch) {
                            const rateMatch = line.match(/Rate:\s*(\d+)Hz/);
                            const uidMatch = line.match(/UID:\s*(\d+)/);
                            appsList.push({
                                package: pkgMatch[1],
                                sensor: pkgMatch[2].trim(),
                                rate: rateMatch ? parseInt(rateMatch[1]) : 50,
                                uid: uidMatch ? uidMatch[1] : "unknown",
                                state: line.includes('BACKGROUND') ? 'BACKGROUND' : 'FOREGROUND',
                                screenOff: line.includes('ScreenOff'),
                                foregroundService: line.includes('ForegroundService'),
                                proximityEngaged: pkgMatch[2].toLowerCase().includes('proximity')
                            });
                        }
                    }
                }
            }
            return appsList;
        }
    },
    audio: {
        shellCommand: "dumpsys audio",
        description: "Audits active microphone recording configurations to detect microphone usage",
        parse: (stdout) => {
            const list = [];
            const lines = stdout.split('\n');
            const activeRecords = new Map();
            let inRecordMonitorSection = false;

            lines.forEach(line => {
                const trimmed = line.trim();
                
                // Track if we are inside RecordActivityMonitor dump section to parse current configurations
                if (trimmed.includes('RecordActivityMonitor dump') || trimmed.includes('Recording activity clients:')) {
                    inRecordMonitorSection = true;
                }
                if (inRecordMonitorSection && (trimmed.startsWith('AudioEventLogger') || trimmed.startsWith('PlaybackActivityMonitor') || trimmed.startsWith('RoutingService'))) {
                    inRecordMonitorSection = false;
                }

                if (line.includes('rec start')) {
                    const riidMatch = line.match(/riid:(\d+)/);
                    const pkgMatch = line.match(/pack:([\w\.]+)/);
                    const uidMatch = line.match(/uid:(\d+)/);
                    if (riidMatch && pkgMatch) {
                        activeRecords.set(riidMatch[1], {
                            package: pkgMatch[1],
                            uid: uidMatch ? uidMatch[1] : "unknown"
                        });
                    }
                } else if (line.includes('rec stop')) {
                    const riidMatch = line.match(/riid:(\d+)/);
                    if (riidMatch) {
                        activeRecords.delete(riidMatch[1]);
                    }
                } else if (inRecordMonitorSection) {
                    // Match current active config dump lines (e.g. session:123 -- client:com.whatsapp -- uid:10123)
                    const configMatch = line.match(/client:([\w\.]+)\s+--\s+uid:(\d+)/) || 
                                         line.match(/pack:([\w\.]+)\s+--\s+uid:(\d+)/) ||
                                         line.match(/pack:([\w\.]+).*?uid:(\d+)/);
                    if (configMatch) {
                        const pkgName = configMatch[1];
                        const uid = configMatch[2];
                        activeRecords.set("direct_" + pkgName + "_" + uid, {
                            package: pkgName,
                            uid: uid
                        });
                    }
                }
            });

            activeRecords.forEach((record) => {
                list.push({
                    package: record.package,
                    uid: record.uid,
                    state: "FOREGROUND",
                    sensor: "Microphone",
                    rate: 1,
                    screenOff: false,
                    foregroundService: true,
                    proximityEngaged: false
                });
            });
            return list;
        }
    },
    camera: {
        shellCommand: "dumpsys media.camera",
        description: "Checks active clients connected to the camera hardware service",
        parse: (stdout) => {
            const list = [];
            const clientSection = stdout.match(/Active Camera Clients:\s*\n?([^]*?)(?=\n\n|\nAllowed user IDs:|\n==)/i);

            if (clientSection && clientSection[1]) {
                const lines = clientSection[1].split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed !== '[]' && trimmed !== '') {
                        const match = trimmed.match(/Client:\s+([\w\.]+)/) || trimmed.match(/([\w\.]+)/);
                        if (match && match[1] !== 'Client' && match[1] !== 'PID') {
                            list.push({
                                package: match[1],
                                uid: "unknown",
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
            }
            return list;
        }
    },
    location: {
        shellCommand: "dumpsys location",
        description: "Checks GPS and location provider active request records",
        parse: (stdout) => {
            const list = [];
            const lines = stdout.split('\n');
            let inActiveRecords = false;
            let currentProvider = "Location";

            for (let line of lines) {
                if (line.includes('Active Records by Provider:')) {
                    inActiveRecords = true;
                    continue;
                }
                if (inActiveRecords && (line.includes('Historical Records by Provider:') || line.includes('Last Known Locations:'))) {
                    inActiveRecords = false;
                }

                if (inActiveRecords) {
                    const providerMatch = line.match(/^(\w+):/);
                    if (providerMatch) {
                        currentProvider = providerMatch[1];
                    }

                    const recordMatch = line.match(/UpdateRecord\[\w+\s+([\w\.]+)\((\d+)(?:\s+(\w+))?\)/);
                    if (recordMatch) {
                        const pkgName = recordMatch[1];
                        const uid = recordMatch[2];
                        const appState = recordMatch[3] ? recordMatch[3].toUpperCase() : 'FOREGROUND';

                        if (pkgName !== 'android' && pkgName !== 'system') {
                            list.push({
                                package: pkgName,
                                uid: uid,
                                state: appState === 'FOREGROUND' ? 'FOREGROUND' : 'BACKGROUND',
                                sensor: currentProvider === 'gps' ? 'GPS_Location' : 'Network_Location',
                                rate: 1,
                                screenOff: appState === 'BACKGROUND',
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
    bluetooth: {
        shellCommand: "dumpsys bluetooth_manager",
        description: "Queries active Bluetooth scanner configurations for GATT scan tracking",
        parse: (stdout) => {
            const list = [];
            const lines = stdout.split('\n');
            let inScannerMap = false;

            for (let line of lines) {
                if (line.includes('GATT Scanner Map')) {
                    inScannerMap = true;
                    continue;
                }
                if (inScannerMap && line.trim() === '') {
                    inScannerMap = false;
                }

                if (inScannerMap) {
                    const match = line.match(/([\w\.]+)(?=\s+\(|:)/);
                    if (match && match[1] !== 'Client' && match[1] !== 'App') {
                        list.push({
                            package: match[1],
                            uid: "unknown",
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
