// cisco-vpn@charisma.ir/routeManager.js
import GLib from 'gi://GLib';
import { execSync } from './utils.js';

export default class RouteManager {
    constructor(runner, network, settings, logger) {
        this.runner = runner;
        this.network = network;
        this.settings = settings;
        this.logger = logger;
        this._applied = false;
    }

    async apply() {
        const domains = this.settings.splitDomains();
        const customDns = this.settings.customDns();

        // Empty domains: let openconnect + vpnc-script handle routes/DNS from server.
        if (!domains.length && !customDns.length)
            return;

        const iface = this.network.interfaceName();
        if (!this.network.connected()) return;

        if (customDns.length) {
            await this._applyDns(iface, customDns);
            this._applied = true;
        }

        if (!domains.length)
            return;

        const dnsReady = await this._waitForVpnDns(iface);
        if (!dnsReady && !customDns.length) {
            this.logger.warn(
                'Split domains configured but no VPN DNS found. ' +
                'Set Custom DNS in settings or clear VPN Domains to use server defaults.'
            );
            return;
        }

        await this._applyResolveDomains(iface, domains);
        this._applied = true;
        this.logger.info(`Split DNS domains applied on ${iface}: ${domains.join(', ')}`);
    }

    async _waitForVpnDns(iface, timeoutSec = 20) {
        return new Promise(resolve => {
            const started = GLib.get_monotonic_time();
            const timeoutUs = timeoutSec * 1000000;

            const check = () => {
                const servers = this._readDnsServers(iface);
                if (servers.length) {
                    this.logger.info(`VPN DNS on ${iface}: ${servers.join(', ')}`);
                    resolve(true);
                    return GLib.SOURCE_REMOVE;
                }
                if (GLib.get_monotonic_time() - started > timeoutUs) {
                    resolve(false);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            };

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, check);
        });
    }

    _readDnsServers(iface) {
        const r = execSync(['resolvectl', 'status', iface]);
        if (!r.success) return [];

        const servers = [];
        for (const line of r.stdout.split('\n')) {
            const match = line.match(/^\s*DNS Servers:\s*(.+)/);
            if (match)
                servers.push(...match[1].trim().split(/\s+/).filter(Boolean));
        }
        return servers;
    }

    async _applyDns(iface, servers) {
        const result = await this.runner.sudo(['resolvectl', 'dns', iface, ...servers]);
        if (!result.success)
            this.logger.warn(`Failed to set DNS on ${iface}: ${result.stderr}`);
        else
            this.logger.info(`Custom DNS on ${iface}: ${servers.join(', ')}`);
    }

    async _applyResolveDomains(iface, domains) {
        const scoped = domains.map(d => `~${d}`);
        const result = await this.runner.sudo(['resolvectl', 'domain', iface, ...scoped]);
        if (!result.success)
            this.logger.warn(`Failed to set resolve domains on ${iface}: ${result.stderr}`);
    }

    async cleanup() {
        if (!this._applied) return;

        const iface = this.network.interfaceName();
        try {
            await this.runner.sudo(['resolvectl', 'revert', iface]);
        } catch (e) {}

        this._applied = false;
    }
}
