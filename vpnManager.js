// cisco-vpn@charisma.ir/vpnManager.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { OpenConnect } from './constants.js';

export default class VPNManager {
    constructor(container) {
        this.container = container;
        
        this.settings = container.get("settings");
        this.network = container.get("network");
        this.session = container.get("session");
        this.state = container.get("state");
        this.notifier = container.get("notifier");
        this.logger = container.get("logger");
        this.events = container.get("events");
        this.secretManager = container.get("secret");
        this.otpManager = container.get("otp");
        this.certificateManager = container.get("certificate");
        this.runner = container.get("runner");
        this.routes = container.get("routes");
        this._connectAttempt = 0;
        this._intentionalDisconnect = false;
        this._hadSuccessfulSession = false;
    }

    get reconnect() {
        try {
            return this.container.get("reconnect");
        } catch (e) {
            return null;
        }
    }

    async connect() {
        if (this.state.isConnected() || this.state.isConnecting()) return;

        const attempt = ++this._connectAttempt;
        this._intentionalDisconnect = false;
        this.state.connecting();
        this.notifier.connecting();

        try {
            this._validateSettings();
            await this._checkDependencies();

            const username = this.settings.username();
            const gateway = this.settings.gateway();
            const password = await this.secretManager.getPassword();
            const otpSecret = await this.secretManager.getOtpSecret();
            
            if (!password) throw new Error("Password not found");
            if (!otpSecret) throw new Error("OTP Secret not found");

            const otp = await this.otpManager.generate(otpSecret);
            const credentials = password + otp;

            let certPin = this.settings.certificate();
            if (!certPin) {
                certPin = await this.certificateManager.fetch(gateway.split(':')[0]);
                if (certPin) this.settings.saveCertificate(certPin);
            }

            const cmd = this._buildCommand(username, gateway, certPin);

            this.logger.info(`Connecting to ${gateway}`);

            await this.runner.spawnDetached(cmd, credentials + '\n');
            await this._waitForConnection();

            if (attempt !== this._connectAttempt) return;

            await this._finalizeConnection();

        } catch (e) {
            if (attempt !== this._connectAttempt) return;

            this.logger.error(e);
            await this._cleanupFailedConnect();
            this.state.disconnected();
            this.notifier.error(e.message);

            if (this._hadSuccessfulSession && this.settings.autoReconnect() && !this._intentionalDisconnect)
                this.reconnect?.scheduleReconnect();
        }
    }

    async acknowledgeConnection() {
        return this._finalizeConnection();
    }

    shouldReportConnectionLoss() {
        return !this._intentionalDisconnect;
    }

    async _finalizeConnection() {
        if (!this.network.connected() || this.state.isConnected()) return;

        const gateway = this.settings.gateway();
        const ip = await this.network.getVpnIp();

        if (!this.network.connected() || this.state.isConnected()) return;

        this.session.start(gateway, ip, this.network.interfaceName());
        this.state.connected();
        this._hadSuccessfulSession = true;
        this.reconnect?.reset();
        this.notifier.connected();
        await this.routes.apply();
        this._startMonitor();
        this.logger.info("VPN Connected");
    }

    _waitForConnection(timeoutSec = 90) {
        return new Promise((resolve, reject) => {
            const started = GLib.get_monotonic_time();
            const timeoutUs = timeoutSec * 1000000;

            const check = () => {
                if (this.network.connected()) {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
                if (GLib.get_monotonic_time() - started > timeoutUs) {
                    reject(new Error('Connection timed out'));
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            };

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, check);
        });
    }

    async _cleanupFailedConnect() {
        if (this.network.processExists())
            await this.runner.sudo(["killall", "-9", "openconnect"]);
        await this.network.removePidFile();
        await this.routes.cleanup();
        this.session.stop();
    }

    async disconnect() {
        this._connectAttempt++;
        this._intentionalDisconnect = true;
        this._hadSuccessfulSession = false;
        this.reconnect?.reset();
        this.logger.info("Disconnect requested");

        try {
            const pid = this.network.getPid();
            if (pid) {
                await this.runner.sudo(["killall", "-9", "openconnect"]);
                await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, r));
            }

            await this.network.removePidFile();
            await this.routes.cleanup();

            this._stopMonitor();
            this.session.stop();
            this.state.disconnected();
            this.notifier.disconnected();

            this.logger.info("Disconnect completed");
        } catch (e) {
            this.logger.error(e);
        }
    }

    _buildCommand(username, gateway, certPin) {
        const argv = [
            "openconnect",
            `--user=${username}`,
            "--passwd-on-stdin",
            "--background",
            `--pid-file=${this.network.pidFile()}`,
            `--interface=${this.network.interfaceName()}`,
        ];

        for (const arg of this._parseExtraArgs(this.settings.openconnectExtraArgs()))
            argv.push(arg);

        const script = this._vpncScript();
        if (script) argv.push(`--script=${script}`);

        if (certPin) argv.push(`--servercert=${certPin}`);

        argv.push(gateway);
        return argv;
    }

    _parseExtraArgs(text) {
        if (!text) return [];

        const tokens = [];
        const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
        let match;
        while ((match = re.exec(text)) !== null) {
            const token = match[1] ?? match[2] ?? match[3];
            if (token)
                tokens.push(token);
        }

        return tokens.filter(token => {
            const flag = token.split('=')[0];
            if (OpenConnect.PROTECTED_FLAGS.includes(flag)) {
                this.logger.warn(`Ignoring protected openconnect flag in extras: ${flag}`);
                return false;
            }
            return true;
        });
    }

    _vpncScript() {
        const candidates = [
            '/usr/share/vpnc-scripts/vpnc-script',
            '/etc/vpnc/vpnc-script',
        ];
        for (const path of candidates) {
            try {
                const r = Gio.File.new_for_path(path);
                if (r.query_exists(null)) return path;
            } catch (e) {}
        }
        return null;
    }

    _validateSettings() {
        if (!this.settings.username()) throw new Error("Username is not configured");
        if (!this.settings.gateway()) throw new Error("Gateway is not configured");
    }

    async _checkDependencies() {
        const cmds = ["sudo", "openconnect", "secret-tool", "oathtool", "openssl", "ip"];
        for (const cmd of cmds) {
            if (!(await this.runner.exists(cmd))) throw new Error(`Command not found: ${cmd}`);
        }
    }

    _startMonitor() {
        if (this._monitorId) return;
        this._monitorId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._checkStatus();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopMonitor() {
        if (!this._monitorId) return;
        GLib.source_remove(this._monitorId);
        this._monitorId = null;
    }

    _checkStatus() {
        if (!this.state.isConnected()) return;
        if (!this.network.connected())
            this.reportConnectionLost();
    }

    async reportConnectionLost() {
        const shouldReconnect = this.shouldReportConnectionLoss()
            && this.settings.autoReconnect()
            && this._hadSuccessfulSession;

        await this.routes.cleanup();
        this._stopMonitor();
        this.session.stop();
        this.state.disconnected();

        if (this.shouldReportConnectionLoss())
            this.notifier.connectionLost();

        if (shouldReconnect)
            this.reconnect?.scheduleReconnect();
    }
}
