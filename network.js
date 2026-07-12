// cisco-vpn@charisma.ir/network.js
import { execSync } from './utils.js';
import { Paths } from './constants.js';

export default class Network {
    constructor(runner) {
        this.runner = runner;
        this._pidFile = Paths.PID_FILE;
        this._ifaceFile = Paths.INTERFACE_FILE;
        this._interfaceName = Paths.INTERFACE_NAME;
    }

    interfaceName() {
        return this._interfaceName;
    }

    pidFile() {
        return this._pidFile;
    }

    getPid() {
        try {
            const r = execSync(['cat', this._pidFile]);
            if (!r.success || !r.stdout) return null;
            const pid = parseInt(r.stdout.trim());
            return isNaN(pid) ? null : pid;
        } catch (e) {
            return null;
        }
    }

    async removePidFile() {
        try {
            await this.runner.removeFile(this._pidFile);
        } catch (e) {}
    }

    processExists() {
        const pid = this.getPid();
        if (!pid) return false;
        const r = execSync(['ps', '-p', pid.toString(), '-o', 'comm=']);
        return r.success && r.stdout.trim() === 'openconnect';
    }

    hasTunnel() {
        if (!this.processExists()) return false;
        const r = execSync(['ip', '-o', 'link', 'show', 'dev', this._interfaceName]);
        return r.success && r.stdout.trim().length > 0;
    }

    connected() {
        return this.processExists() && this.hasTunnel();
    }

    async getVpnIp() {
        if (!this.processExists()) return null;
        try {
            const r = execSync(['ip', '-j', 'addr', 'show', 'dev', this._interfaceName]);
            if (!r.success) return null;
            const data = JSON.parse(r.stdout);
            for (const addr of data[0]?.addr_info || []) {
                if (addr.family === 'inet') return addr.local;
            }
        } catch (e) {}
        return null;
    }

    async cleanupTunnel() {
        if (!this.hasTunnel()) return;
        try {
            await this.runner.sudo(["ip", "link", "delete", this._interfaceName]);
        } catch (e) {}
    }
}