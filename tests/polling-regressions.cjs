// Offline regressions. Mocked GI, filesystem and VPN; never touch a real tunnel.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sourceDir = path.resolve(process.argv[2] || '.');
const variant = 'target-source';
let passed = 0, failed = 0;
const cases = [];
function test(name, fn) {
    cases.push([name, fn]);
}
function load(file, className, globals) {
    const source = fs.readFileSync(path.join(sourceDir, file), 'utf8')
        .replace(/^import .*\n/gm, '')
        .replace('export default class ', 'class ');
    const context = vm.createContext({TextDecoder, ...globals});
    vm.runInContext(source + `\nglobalThis.Exported = ${className};`, context);
    return {Class: context.Exported, context};
}
function networkFixture() {
    const files = new Map([['/test/pid', '123\n'], ['/proc/123/comm', 'openconnect\n']]);
    const interfaces = new Set(['/sys/class/net/cscovpn0']);
    let commands = [];
    const {Class} = load('network.js', 'Network', {
        Paths: {PID_FILE: '/test/pid', INTERFACE_FILE: '/test/interface', INTERFACE_NAME: 'cscovpn0'},
        Gio: {File: {new_for_path: name => ({
            load_contents() {
                if (!files.has(name)) throw Error('ENOENT');
                return [true, new TextEncoder().encode(files.get(name))];
            },
            query_exists() { return interfaces.has(name); },
        })}},
        execSync(argv) {
            commands.push(argv);
            if (argv[0] === 'ip' && argv[1] === '-j')
                return {success: true, stdout: '[{"addr_info":[{"family":"inet","local":"192.0.2.5"}]}]'};
            throw Error('Status polling spawned a synchronous command');
        },
    });
    return {network: new Class({}), files, interfaces, commands};
}
test('live process and existing interface recognized with ZERO subprocesses', () => {
    const f = networkFixture(); assert.equal(f.network.connected(), true); assert.equal(f.commands.length, 0);
});
test('missing/invalid PID, gone process, wrong comm and missing tunnel remain disconnected', () => {
    const f = networkFixture();
    for (const value of ['', '0', '-1', '999999999999999999999999']) {
        f.files.set('/test/pid', value); assert.equal(f.network.connected(), false);
    }
    f.files.delete('/test/pid'); assert.equal(f.network.connected(), false);
    f.files.set('/test/pid', '123'); f.files.delete('/proc/123/comm'); assert.equal(f.network.connected(), false);
    f.files.set('/proc/123/comm', 'unrelated\n'); assert.equal(f.network.connected(), false);
    f.files.set('/proc/123/comm', 'openconnect\n'); f.interfaces.clear(); assert.equal(f.network.connected(), false);
    assert.equal(f.commands.length, 0);
});
test('existing PID whitespace and parseInt interpretation are preserved', () => {
    const f = networkFixture();
    f.files.set('/test/pid', ' 123\n'); assert.equal(f.network.connected(), true);
    f.files.set('/test/pid', '123junk'); assert.equal(f.network.connected(), true);
    assert.equal(f.commands.length, 0);
});
function managerFixture() {
    let next = 1, cancelled = 0, checks = 0, metricCancelled = 0, reconnects = 0;
    const sources = new Map();
    const GLib = {
        PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true,
        timeout_add_seconds(priority, interval, callback) {
            assert.equal(interval, 3); const id = next++; sources.set(id, callback); return id;
        },
        source_remove(id) { assert(sources.delete(id), 'removed invalid or already removed source'); },
    };
    const unexpected = () => { throw Error('Unexpected VPN/route/DNS/process action'); };
    const services = {
        network: {connected() { checks++; return true; }, cleanupTunnel: unexpected, removePidFile: unexpected},
        state: {isConnected: () => true, disconnected: unexpected},
        routes: {cleanup: unexpected, apply: unexpected, _cancelMetricRetry() { metricCancelled++; }}, runner: {sudo: unexpected},
        session: {stop: unexpected}, notifier: {disconnected: unexpected},
        reconnect: {cancel() { cancelled++; }, scheduleReconnect() { reconnects++; }},
    };
    const {Class} = load('vpnManager.js', 'VPNManager', {GLib, Gio: {}, OpenConnect: {}});
    const make = () => new Class({get: name => services[name] || {}});
    return {make, sources, services, cancelled: () => cancelled, checks: () => checks,
        metricCancelled: () => metricCancelled, reconnects: () => reconnects};
}
test('manager destruction stops polling without VPN teardown and cannot restart', () => {
    const f = managerFixture(), manager = f.make();
    manager._startMonitor(); manager._startMonitor(); assert.equal(f.sources.size, 1);
    [...f.sources.values()][0](); assert.equal(f.checks(), 1);
    manager.destroy(); assert.equal(f.sources.size, 0); assert.equal(f.cancelled(), 1);
    assert.equal(f.metricCancelled(), 1);
    manager.destroy(); manager._startMonitor(); manager._checkStatus();
    assert.equal(f.sources.size, 0); assert.equal(f.checks(), 1);
});
test('ten indicator lifecycle replacements leave only one current manager timer', () => {
    const f = managerFixture(); let old;
    for (let i = 0; i < 10; i++) {
        if (old) old.destroy();
        const current = f.make(); current._startMonitor(); assert.equal(f.sources.size, 1); old = current;
    }
    old.destroy(); assert.equal(f.sources.size, 0);
});
test('in-flight loss handling cannot schedule reconnect after retirement', async () => {
    const f = managerFixture(), manager = f.make();
    let release;
    f.services.settings = manager.settings = {autoReconnect: () => true};
    f.services.routes.cleanup = () => new Promise(resolve => { release = resolve; });
    f.services.session.stop = () => {}; f.services.state.disconnected = () => {};
    f.services.notifier.connectionLost = () => {};
    manager.shouldReportConnectionLoss = () => true; manager._hadSuccessfulSession = true;
    const pending = manager.reportConnectionLost();
    manager.destroy(); release(); await pending;
    assert.equal(f.reconnects(), 0); assert.equal(f.sources.size, 0);
});
test('in-flight failed connection cannot schedule reconnect after retirement', async () => {
    const f = managerFixture(), manager = f.make(); let rejectPassword;
    manager._validateSettings = () => {}; manager._checkDependencies = async () => {};
    manager.settings = {username: () => 'test', gateway: () => 'test', autoReconnect: () => true};
    manager.secretManager = {getPassword: () => new Promise((resolve, reject) => { rejectPassword = reject; }),
        getOtpSecret: async () => 'unused'};
    f.services.state.isConnected = () => false; f.services.state.isConnecting = () => false;
    f.services.state.connecting = () => {}; f.services.state.disconnected = () => {};
    f.services.notifier.connecting = () => {}; f.services.notifier.error = () => {};
    manager.logger = {error: () => {}}; manager._cleanupFailedConnect = async () => {};
    manager._hadSuccessfulSession = true;
    const pending = manager.connect(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof rejectPassword, 'function'); manager.destroy(); rejectPassword(Error('test failure')); await pending;
    assert.equal(f.reconnects(), 0); assert.equal(f.sources.size, 0);
});
test('indicator retirement invokes timer-only manager cleanup', () => {
    let baseDestroyed = 0, managerDestroyed = 0;
    const ids = new Set([11, 12]);
    class Button { destroy() { baseDestroyed++; } }
    const {context} = load('extension.js', 'CiscoVPNExtension', {
        GObject: {registerClass: value => value}, PanelMenu: {Button}, Extension: class {},
        GLib: {source_remove(id) { assert(ids.delete(id)); }},
        St: {}, Gio: {}, Main: {}, PopupMenu: {}, Icons: {}, createVPN() { throw Error('Unexpected VPN creation'); },
    });
    const Indicator = vm.runInContext('CiscoVPNIndicator', context);
    const indicator = new Indicator(); indicator._autoConnectId = 11; indicator._monitorId = 12;
    indicator._vpn = {destroy() { managerDestroyed++; }}; indicator.destroy();
    assert.equal(ids.size, 0); assert.equal(managerDestroyed, 1); assert.equal(baseDestroyed, 1);
});
(async () => {
    for (const [name, fn] of cases) {
        try { await fn(); passed++; console.log('PASS ' + name); }
        catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
    }
    console.log(JSON.stringify({variant, passed, failed}));
    process.exitCode = failed ? 1 : 0;
})();
