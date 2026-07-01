const { exec } = require('child_process');

function parseAudioOutput(stdout) {
    const list = [];
    const lines = stdout.split('\n');
    const activeRecords = new Map();
    
    lines.forEach(line => {
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

exec('adb shell dumpsys audio', (err, stdout) => {
    if (err) {
        console.error('Error running adb:', err);
        return;
    }
    const result = parseAudioOutput(stdout);
    console.log('Parsed active microphone recorders:');
    console.log(result);
});
