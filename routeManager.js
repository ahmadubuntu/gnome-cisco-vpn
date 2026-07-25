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
        const iface = this.network.interfaceName();
        if (!this.network.connected()) return;

        await this._waitForRoutes(iface);
        await this._applyRouteMetrics(iface);

        const domains = this.settings.splitDomains();
        const customDns = this.settings.customDns();

        // Empty domains: leave DNS to openconnect + vpnc-script.
        if (!domains.length && !customDns.length)
            return;

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

    async _waitForRoutes(iface, timeoutSec = 15) {
        return new Promise(resolve => {
            const started = GLib.get_monotonic_time();
            const timeoutUs = timeoutSec * 1000000;

            const check = () => {
                if (this._listIfaceRoutes(iface).length > 0) {
                    resolve(true);
                    return GLib.SOURCE_REMOVE;
                }
                if (GLib.get_monotonic_time() - started > timeoutUs) {
                    this.logger.warn(`No routes yet on ${iface}; metric apply may be incomplete`);
                    resolve(false);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            };

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, check);
        });
    }

    _listIfaceRoutes(iface) {
        const r = execSync(['ip', '-j', 'route', 'show', 'dev', iface]);
        if (!r.success || !r.stdout) return [];

        try {
            const data = JSON.parse(r.stdout);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    async _applyRouteMetrics(iface) {
        const metric = this.settings.routeMetric();
        const routes = this._listIfaceRoutes(iface).filter(r => this._shouldRetagRoute(r));
        if (!routes.length) return;

        // Linux treats different metrics as separate routes, so `replace` with a
        // new metric leaves the original (metric-less) entry. Group by destination
        // and rewrite once.
        const groups = new Map();
        for (const route of routes) {
            const key = this._routeKey(route);
            if (!groups.has(key))
                groups.set(key, []);
            groups.get(key).push(route);
        }

        let updated = 0;
        for (const variants of groups.values()) {
            const alreadyOk = variants.length === 1
                && Number(variants[0].metric ?? 0) === metric;
            if (alreadyOk)
                continue;

            const template = variants[0];
            for (const route of variants) {
                const del = await this.runner.sudo(this._buildDeleteArgv(route, iface));
                if (!del.success)
                    this.logger.warn(`Failed to delete route ${route.dst}: ${del.stderr}`);
            }

            const add = await this.runner.sudo(this._buildAddArgv(template, iface, metric));
            if (add.success)
                updated++;
            else
                this.logger.warn(`Failed to add metric route ${template.dst}: ${add.stderr}`);
        }

        if (updated)
            this.logger.info(`Applied metric ${metric} to ${updated} route(s) on ${iface}`);
    }

    _routeKey(route) {
        return [
            route.dst,
            route.gateway || '',
            route.scope || '',
            route.src || '',
        ].join('|');
    }

    _shouldRetagRoute(route) {
        if (!route || !route.dst) return false;
        if (route.dst === 'default' || route.dst === '0.0.0.0/0') return false;
        if (route.type === 'local' || route.type === 'broadcast' || route.type === 'unreachable')
            return false;
        return true;
    }

    _buildDeleteArgv(route, iface) {
        const argv = ['ip', 'route', 'del', route.dst];

        if (route.gateway)
            argv.push('via', route.gateway);

        argv.push('dev', iface);

        if (route.metric != null)
            argv.push('metric', String(route.metric));

        return argv;
    }

    _buildAddArgv(route, iface, metric) {
        const argv = ['ip', 'route', 'add', route.dst];

        if (route.gateway)
            argv.push('via', route.gateway);

        argv.push('dev', iface);

        if (route.protocol && route.protocol !== 'kernel' && route.protocol !== 'boot')
            argv.push('proto', String(route.protocol));

        if (route.scope && route.scope !== 'global')
            argv.push('scope', String(route.scope));

        if (route.src)
            argv.push('src', route.src);

        argv.push('metric', String(metric));
        return argv;
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
