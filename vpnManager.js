// cisco-vpn@charisma.ir/vpnManager.js
import GLib from 'gi://GLib';

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
    }

    async connect() {
        if (this.state.isConnected() || this.state.isConnecting()) return;

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

            const result = await this.runner.sudo(cmd, credentials + '\n');

            if (!result.success) throw new Error(result.stderr || "Failed");

            await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, r));

            const ip = await this.network.getVpnIp();
            this.session.start(gateway, ip);
            this.state.connected();
            this.notifier.connected();

            this._startMonitor();
            this.logger.info("VPN Connected");

        } catch (e) {
            this.logger.error(e);
            this.state.disconnected();
            this.notifier.error(e.message);
        }
    }

    async disconnect() {
        this.logger.info("Disconnect requested");

        try {
            const pid = this.network.getPid();
            if (pid) {
                await this.runner.sudo(["killall", "-9", "openconnect"]);
                await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, r));
            }

            await this.network.removePidFile();

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
            "--useragent=AnyConnect",
            "--protocol=anyconnect",
            "--passwd-on-stdin",
            "--disable-ipv6",
            "--no-dtls",
            "--background",
            `--pid-file=${this.network.pidFile()}`
        ];

        if (certPin) argv.push(`--servercert=${certPin}`);
        argv.push(gateway);
        return argv;
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
        if (this._monitorId) GLib.source_remove(this._monitorId);
    }

    _checkStatus() {
        if (!this.state.isConnected()) return;
        if (!this.network.connected()) {
            this.state.disconnected();
            this.session.stop();
            this.notifier.connectionLost();
        }
    }
}