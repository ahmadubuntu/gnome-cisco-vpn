// cisco-vpn@charisma.ir/network.js
import { execSync } from './utils.js';
import { Paths } from './constants.js';
import Gio from 'gi://Gio';

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
            const pid = parseInt(this._readText(this._pidFile).trim());
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
        try {
            return this._readText(`/proc/${pid}/comm`).trim() === 'openconnect';
        } catch (e) {
            return false;
        }
    }

    hasTunnel() {
        if (!this.processExists()) return false;
        return Gio.File.new_for_path(`/sys/class/net/${this._interfaceName}`).query_exists(null);
    }

    _readText(path) {
        const [ok, bytes] = Gio.File.new_for_path(path).load_contents(null);
        if (!ok) throw new Error('Could not read VPN status file');
        return new TextDecoder().decode(bytes);
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
