// cisco-vpn@charisma.ir/network.js
import { execSync } from './utils.js';
import { Paths } from './constants.js';

export default class Network {
    constructor(runner) {
        this.runner = runner;
        this._pidFile = Paths.PID_FILE;
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

    getInterfaces() {
        const r = execSync(['ip', '-o', 'link', 'show']);
        if (!r.success) return [];
        return r.stdout.split('\n')
            .map(line => {
                const match = line.match(/^\d+:\s*(\S+):/);
                return match ? match[1] : null;
            })
            .filter(name => name && (name.startsWith('tun') || name.startsWith('vpn') || name.startsWith('csco')));
    }

    hasTunnel() {
        return this.getInterfaces().length > 0;
    }

    connected() {
        return this.processExists() && this.hasTunnel();
    }

    async getVpnIp() {
        try {
            const r = execSync(['ip', '-j', 'addr']);
            if (!r.success) return null;
            const data = JSON.parse(r.stdout);
            for (const iface of data) {
                if (iface.ifname && (iface.ifname.startsWith('tun') || iface.ifname.startsWith('vpn') || iface.ifname.startsWith('csco'))) {
                    for (const addr of iface.addr_info || []) {
                        if (addr.family === 'inet') return addr.local;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    async cleanupTunnel() {
        const ifaces = this.getInterfaces();
        for (const iface of ifaces) {
            try {
                await this.runner.sudo(["ip", "link", "delete", iface]);
            } catch (e) {}
        }
        // Extra cleanup
        await this.runner.sudo(["ip", "link", "delete", "tun0"]).catch(() => {});
        await this.runner.sudo(["ip", "link", "delete", "vpn0"]).catch(() => {});
    }
}