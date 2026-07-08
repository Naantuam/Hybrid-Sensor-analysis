const { commands } = require('../backend/agent/commands');
const assert = require('assert');

console.log('[*] Running parser unit tests...');

// 1. Test Location Parser
function testLocationParser() {
    console.log('[*] Testing location parser...');
    
    // Scenario A: Standard Android 10 format with foreground state
    const stdOutput = `
Active Records by Provider:
  gps:
    UpdateRecord[gps com.example.foregroundapp(10123 FOREGROUND)]
    UpdateRecord[gps com.example.backgroundapp(10124 BACKGROUND)]
Historical Records by Provider:
    `;
    const stdResult = commands.location.parse(stdOutput);
    assert.strictEqual(stdResult.length, 2);
    assert.strictEqual(stdResult[0].package, 'com.example.foregroundapp');
    assert.strictEqual(stdResult[0].state, 'FOREGROUND');
    assert.strictEqual(stdResult[1].package, 'com.example.backgroundapp');
    assert.strictEqual(stdResult[1].state, 'BACKGROUND');

    // Scenario B: Android 10+ layout where application state is omitted
    const noStateOutput = `
Active Records by Provider:
  gps:
    UpdateRecord[gps com.example.statelessapp(10200)]
Last Known Locations:
    `;
    const noStateResult = commands.location.parse(noStateOutput);
    assert.strictEqual(noStateResult.length, 1);
    assert.strictEqual(noStateResult[0].package, 'com.example.statelessapp');
    assert.strictEqual(noStateResult[0].state, 'FOREGROUND'); // Default fallback

    console.log('[+] Location parser verified successfully.');
}

// 2. Test Audio Parser
function testAudioParser() {
    console.log('[*] Testing audio parser...');

    // Scenario A: Historical rec start/stop log event parsing
    const historyOutput = `
RecordActivityMonitor dump
  Recording event log:
    rec start riid:1 pack:com.whatsapp uid:10123
    rec start riid:2 pack:com.zoom uid:10124
    rec stop riid:1
PlaybackActivityMonitor dump
    `;
    const historyResult = commands.audio.parse(historyOutput);
    assert.strictEqual(historyResult.length, 1);
    assert.strictEqual(historyResult[0].package, 'com.zoom');

    // Scenario B: Active config dump parsing (under RecordActivityMonitor)
    const activeConfigOutput = `
RecordActivityMonitor dump
  max recorded configs: 10
  number of configs: 1
  session:45 -- client:com.skype -- uid:10342 -- patch:3 -- source:1
PlaybackActivityMonitor dump
    `;
    const activeConfigResult = commands.audio.parse(activeConfigOutput);
    assert.strictEqual(activeConfigResult.length, 1);
    assert.strictEqual(activeConfigResult[0].package, 'com.skype');
    assert.strictEqual(activeConfigResult[0].uid, '10342');

    console.log('[+] Audio parser verified successfully.');
}

try {
    testLocationParser();
    testAudioParser();
    console.log('\n[SUCCESS] All parsing configuration unit tests passed!');
} catch (error) {
    console.error('\n[FAILURE] Parser tests failed:', error);
    process.exit(1);
}
