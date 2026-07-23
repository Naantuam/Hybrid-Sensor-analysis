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
            if (!stdout) return list;
            const lines = stdout.split('\n');
            const activePackages = new Map(); // pkgName -> uid

            // riidMap tracks open recording sessions (rec start -> add, rec stop -> remove)
            const riidMap = new Map();
            // focusMap tracks the MOST RECENT requestAudioFocus per package (timestamp -> pkg)
            const focusMap = new Map(); // pkg -> { uid, timestamp }

            // Determine today's date prefix (MM-DD) for filtering historical logs
            const now = new Date();
            const todayMM = String(now.getMonth() + 1).padStart(2, '0');
            const todayDD = String(now.getDate()).padStart(2, '0');
            const todayPrefix = `${todayMM}-${todayDD}`;

            let inActiveRecordClients = false;
            let currentRecord = null;

            lines.forEach(line => {
                const trimmed = line.trim();
                const lower = trimmed.toLowerCase();

                // 1. Parse rec start/stop/update transaction logs
                // Format: "07-22 15:54:52:000 rec start riid:65119 uid:10224 session:64881 src:MIC pack:com.whatsapp"
                const matchEvent = trimmed.match(/^(\d{2}-\d{2}).*rec\s+(start|stop|update)\s+riid:(\d+)\s+uid:(\d+)\s+session:\d+\s+src:\w+\s+pack:([\w\.]+)/i);
                if (matchEvent) {
                    const datePrefix = matchEvent[1]; // MM-DD
                    const action = matchEvent[2].toLowerCase();
                    const riid = matchEvent[3];
                    const uid = matchEvent[4];
                    let pkgName = matchEvent[5];

                    if (!pkgName.includes('.') && uidToPackageMap && uidToPackageMap.has(uid)) {
                        pkgName = uidToPackageMap.get(uid);
                    }

                    if (action === 'start' || action === 'update') {
                        // Only track recordings that started TODAY to avoid stale entries
                        if (datePrefix === todayPrefix) {
                            riidMap.set(riid, { uid, package: pkgName });
                        }
                    } else if (action === 'stop') {
                        riidMap.delete(riid);
                    }
                }

                // 2. Parse requestAudioFocus — keep only the most recent entry per package
                // Format: "07-22 15:54:52:000 requestAudioFocus() from uid/pid 10224/23852 ... callingPack=com.whatsapp req=2"
                const matchFocus = trimmed.match(/^(\d{2}-\d{2}).*requestAudioFocus\(\).*uid\/pid\s+(\d+)\/(\d+).*callingPack=([\w\.]+)/i) ||
                                   trimmed.match(/^(\d{2}-\d{2}).*uid\/pid\s+(\d+)\/(\d+).*callingPack=([\w\.]+)/i);
                if (matchFocus) {
                    const datePrefix = matchFocus[1];
                    const uid = matchFocus[2];
                    let pkg = matchFocus[4];

                    if ((!pkg || !pkg.includes('.')) && uidToPackageMap && uidToPackageMap.has(uid)) {
                        pkg = uidToPackageMap.get(uid);
                    }

                    // Only consider today's focus events; store the most recent per pkg
                    if (pkg && pkg !== 'android' && pkg !== 'system' &&
                        !SYSTEM_PREFIXES.some(prefix => pkg.startsWith(prefix)) &&
                        datePrefix === todayPrefix) {
                        focusMap.set(pkg, { uid, datePrefix });
                    }
                }

                // 3. Detect start of Active record clients section
                if (lower.includes('active record clients:') || lower.includes('active record client')) {
                    inActiveRecordClients = true;
                    return;
                }

                if (inActiveRecordClients && (trimmed.startsWith('-') && !trimmed.startsWith('- Session') && !trimmed.startsWith('- Session:'))) {
                    if (!lower.includes('session')) {
                        inActiveRecordClients = false;
                    }
                }

                if (inActiveRecordClients) {
                    if (lower.startsWith('session:') || lower.startsWith('- session:')) {
                        if (currentRecord && currentRecord.package) {
                            activePackages.set(currentRecord.package, currentRecord.uid || "1000");
                        }
                        currentRecord = { uid: null, package: null };
                    }

                    const uidMatch = trimmed.match(/uid:?\s*(\d+)/i) || trimmed.match(/uid\s+(\d+)/i);
                    const pkgMatch = trimmed.match(/(?:Client|client|package|pack|package=):\s*"?([\w\.]+)"?/i);
                    if (uidMatch && currentRecord) currentRecord.uid = uidMatch[1];
                    if (pkgMatch && currentRecord) currentRecord.package = pkgMatch[1];
                }

                // 4. Support flat RecordActivity / rec start lines
                if (lower.includes('recordactivity') || lower.includes('rec start')) {
                    const uidMatch = trimmed.match(/uid:?\s*(\d+)/i) || trimmed.match(/uid\s+(\d+)/i);
                    const pkgMatch = trimmed.match(/(?:Client|client|package|pack|package=):\s*"?([\w\.]+)"?/i) ||
                                     trimmed.match(/pack:([\w\.]+)/i) ||
                                     trimmed.match(/package\s+([\w\.]+)/i);

                    let resolvedPkg = pkgMatch ? pkgMatch[1] : null;
                    if (uidMatch && (!resolvedPkg || !resolvedPkg.includes('.')) && uidToPackageMap && uidToPackageMap.has(uidMatch[1])) {
                        resolvedPkg = uidToPackageMap.get(uidMatch[1]);
                    }

                    if (resolvedPkg) {
                        activePackages.set(resolvedPkg, uidMatch ? uidMatch[1] : "1000");
                    }
                }
            });

            // Merge: today-only focus requests into activePackages
            focusMap.forEach((val, pkg) => {
                activePackages.set(pkg, val.uid);
            });

            // Include active SAME-DAY recording transactions from riidMap
            riidMap.forEach(rec => {
                let pkgName = rec.package;
                if ((!pkgName || !pkgName.includes('.')) && rec.uid && uidToPackageMap) {
                    pkgName = uidToPackageMap.get(rec.uid);
                }
                if (pkgName) {
                    activePackages.set(pkgName, rec.uid || "1000");
                }
            });

            activePackages.forEach((uid, pkgName) => {
                if (pkgName && pkgName !== "android" && pkgName !== "system") {
                    list.push({
                        package: pkgName,
                        uid: uid || "1000",
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
        shellCommand: "dumpsys media.camera || dumpsys camera",
        description: "Checks active clients connected to the camera hardware service",
        parse: (stdout) => {
            const list = [];
            if (!stdout) return list;
            const lines = stdout.split('\n');
            const invalidWords = new Set(['for', 'instance', 'device', 'client', 'package', 'active', 'null', 'undefined', 'android', 'system']);

            // Track the MOST RECENT event per (package+PID). Only emit if that event is CONNECT.
            // Event log format: "07-21 23:38:38 : DISCONNECT device 1 client for package com.snapchat.android (PID 31089)"
            //                   "07-21 23:38:37 : CONNECT device 1 client for package com.snapchat.android (PID 31089)"
            const lastEventByKey = new Map(); // key: "pkg:PID" -> { type: 'CONNECT'|'DISCONNECT'|'REJECT', pkg, uid }
            let inActiveSection = false;

            lines.forEach(line => {
                const trimmed = line.trim();
                const lower = trimmed.toLowerCase();

                // Detect the active camera clients section
                if (lower.includes('active camera clients')) {
                    inActiveSection = true;
                    return;
                }
                // Stop at next major section header
                if (inActiveSection && (lower.includes('camera module') || lower.includes('camera device') ||
                    lower.includes('camera service events') || lower.includes('allowed user'))) {
                    if (!lower.includes('active camera')) inActiveSection = false;
                }

                // Parse event log lines inside active section
                // Format: "MM-DD HH:MM:SS : TYPE device N client for package com.pkg (PID NNN)"
                const eventMatch = trimmed.match(/:\s+(CONNECT|DISCONNECT|REJECT)\s+device\s+\d+\s+client\s+for\s+package\s+([\w\.]+)\s*\(PID\s+(\d+)\)/i);
                if (eventMatch) {
                    const type = eventMatch[1].toUpperCase();
                    const pkg = eventMatch[2];
                    const pid = eventMatch[3];
                    const key = `${pkg}:${pid}`;
                    // Only store the first match per key — dumpsys lists newest-first, so first = most recent
                    if (!lastEventByKey.has(key)) {
                        lastEventByKey.set(key, { type, pkg, pid });
                    }
                    return;
                }

                // Fallback: match non-event lines for currently open clients (e.g. older Android format)
                if (!trimmed.match(/^\d{2}-\d{2}/)) {
                    if (lower.includes('disconnect') || lower.includes('reject')) return;
                    const pkgMatch = trimmed.match(/client\s+for\s+package\s+([\w\.]+)/i) ||
                                     trimmed.match(/Client\s+["']([\w\.]+)["']/i) ||
                                     trimmed.match(/client:\s*([\w\.]+)/i);
                    if (pkgMatch && pkgMatch[1]) {
                        const pkgName = pkgMatch[1];
                        if (pkgName.includes('.') && !invalidWords.has(pkgName.toLowerCase())) {
                            list.push({
                                package: pkgName,
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
                }
            });

            // Emit only packages whose most recent event is CONNECT (i.e. currently active)
            const emitted = new Set();
            lastEventByKey.forEach(({ type, pkg }) => {
                if (type === 'CONNECT' && pkg.includes('.') && !invalidWords.has(pkg.toLowerCase()) && !emitted.has(pkg)) {
                    emitted.add(pkg);
                    list.push({
                        package: pkg,
                        uid: "1000",
                        state: "FOREGROUND",
                        sensor: "Camera",
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
    location: {
        shellCommand: "dumpsys location",
        description: "Checks GPS and location provider active request records",
        parse: (stdout) => {
            const list = [];
            if (!stdout) return list;
            const lines = stdout.split('\n');

            // Packages known to actively request location (collected from stats summary lines)
            // Format: "com.google.android.gms: gps: Min interval ... Currently active"
            //         "android: passive: ... Currently active"
            const activeFromStats = new Set();
            lines.forEach(line => {
                const trimmed = line.trim();
                // Stats summary: "pkg: provider: ... Currently active"
                const statsMatch = trimmed.match(/^([\w\.]+):\s*(gps|network|passive|fused):\s+.*Currently active/i);
                if (statsMatch) {
                    const pkg = statsMatch[1];
                    if (pkg !== 'android' && pkg !== 'system') {
                        activeFromStats.add(pkg + ':' + statsMatch[2].toLowerCase());
                    }
                }
            });

            // Dedup: only emit each pkg+provider once
            const emitted = new Set();

            lines.forEach(line => {
                const trimmed = line.trim();

                // Pattern 1: WorkSource format
                // "request: WorkSource{10123 com.google.android.apps.maps}"
                const wsMatch = trimmed.match(/WorkSource\{\s*(\d+)\s+([\w\.]+)\s*\}/);

                // Pattern 2: UpdateRecord format (Android 10)
                // "UpdateRecord[passive com.google.android.gms(10132 foreground) ...]"
                // "UpdateRecord[gps com.whatsapp(10123)]"
                const urMatch = trimmed.match(/UpdateRecord\[(\w+)\s+([\w\.]+)\((\d+)/);

                // Pattern 3: receiver format
                const rcMatch = trimmed.match(/receiver:\s*([\w\.]+)\s*\(uid\s+(\d+)\)/);

                let pkgName = null;
                let uid = null;
                let provider = 'gps';

                if (wsMatch) {
                    uid = wsMatch[1];
                    pkgName = wsMatch[2];
                } else if (urMatch) {
                    provider = urMatch[1].toLowerCase();
                    pkgName = urMatch[2];
                    uid = urMatch[3];
                } else if (rcMatch) {
                    pkgName = rcMatch[1];
                    uid = rcMatch[2];
                }

                // Exclude pure system entries (android, system) but KEEP com.google.android.gms
                // GMS is an important location actor — intentionally NOT filtered out here
                const LOCATION_SYSTEM_SKIP = new Set(['android', 'system']);

                if (pkgName && !LOCATION_SYSTEM_SKIP.has(pkgName)) {
                    const dedupeKey = `${pkgName}:${provider}`;
                    if (!emitted.has(dedupeKey)) {
                        emitted.add(dedupeKey);
                        const sensorLabel = (provider === 'gps') ? 'GPS_Location' :
                                            (provider === 'network') ? 'Network_Location' : 'Passive_Location';
                        list.push({
                            package: pkgName,
                            uid: uid || 'unknown',
                            state: 'FOREGROUND',
                            sensor: sensorLabel,
                            rate: 1,
                            screenOff: false,
                            foregroundService: true,
                            proximityEngaged: false
                        });
                    }
                }
            });

            // Also emit any 'Currently active' stats entries not already captured
            activeFromStats.forEach(key => {
                if (!emitted.has(key)) {
                    emitted.add(key);
                    const [pkg, provider] = key.split(':');
                    const sensorLabel = (provider === 'gps') ? 'GPS_Location' :
                                        (provider === 'network') ? 'Network_Location' : 'Passive_Location';
                    list.push({
                        package: pkg,
                        uid: 'unknown',
                        state: 'FOREGROUND',
                        sensor: sensorLabel,
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
