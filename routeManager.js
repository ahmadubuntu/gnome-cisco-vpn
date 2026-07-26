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
        this._managedRoutes = [];
        this._metricRetryId = 0;
    }

    async apply() {
        const iface = this.network.interfaceName();
        if (!this.network.connected()) return;

        await this._waitForRoutes(iface);
        await this._applyRouteMetrics(iface);
        this._scheduleMetricRetry(iface);

        await this._applyDomainRouteMap(iface);

        const domains = this.settings.splitDomains();
        const customDns = this.settings.customDns();

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

    async _applyDomainRouteMap(iface) {
        const rules = this.settings.domainRoutes();
        if (!rules.length) return;

        const forceMetric = this.settings.forceRouteMetric();
        const excludeMetric = this.settings.excludeRouteMetric();
        let added = 0;

        for (const rule of rules) {
            const ips = this._resolveDomainIps(rule.domain);
            if (!ips.length) {
                this.logger.warn(`Domain route did not resolve: ${rule.domain} → ${rule.iface}`);
                continue;
            }

            const isCisco = rule.iface === iface;
            const target = isCisco
                ? { dev: iface, gateway: null, metric: forceMetric }
                : this._resolveNamedInterface(rule.iface, iface, excludeMetric);

            if (!target) {
                this.logger.warn(`Domain route interface unavailable: ${rule.domain} → ${rule.iface}`);
                continue;
            }

            for (const ip of ips) {
                if (!isCisco)
                    await this._deleteHostRoutes(iface, ip);

                const ok = await this._installHostRoute({
                    ip,
                    dev: target.dev,
                    gateway: target.gateway,
                    metric: target.metric,
                    label: `${rule.domain} → ${target.dev}`,
                });
                if (ok) {
                    this._managedRoutes.push({
                        ip,
                        dev: target.dev,
                        gateway: target.gateway,
                        metric: target.metric,
                    });
                    added++;
                }
            }
        }

        if (added)
            this.logger.info(`Applied ${added} domain-route host route(s)`);
    }

    _resolveNamedInterface(name, ciscoIface, metric) {
        if (!name || name === ciscoIface)
            return { dev: ciscoIface, gateway: null, metric: this.settings.forceRouteMetric() };

        const link = execSync(['ip', '-o', 'link', 'show', 'dev', name]);
        if (!link.success)
            return null;

        return { dev: name, gateway: null, metric };
    }

    _scheduleMetricRetry(iface) {
        this._cancelMetricRetry();
        this._metricRetryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._metricRetryId = 0;
            if (this.network.connected())
                this._applyRouteMetrics(iface).catch(e => this.logger.warn(String(e)));
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelMetricRetry() {
        if (!this._metricRetryId) return;
        GLib.source_remove(this._metricRetryId);
        this._metricRetryId = 0;
    }

    async _installHostRoute({ ip, dev, gateway, metric, label }) {
        await this._deleteHostRoutes(dev, ip);

        const argv = ['ip', 'route', 'add', `${ip}/32`];
        if (gateway)
            argv.push('via', gateway);
        argv.push('dev', dev, 'metric', String(metric));

        const result = await this.runner.sudo(argv);
        if (!result.success) {
            this.logger.warn(`Failed ${label} route ${ip}/32: ${result.stderr}`);
            return false;
        }

        this.logger.info(
            `Route ${ip}/32 → ${gateway ? `via ${gateway} ` : ''}dev ${dev} metric ${metric} (${label})`
        );
        return true;
    }

    async _deleteHostRoutes(dev, ip) {
        const routes = this._listIfaceRoutes(dev).filter(r =>
            r.dst === ip || r.dst === `${ip}/32`
        );

        for (const route of routes) {
            await this.runner.sudo(this._buildDeleteArgv(route, dev));
        }

        await this.runner.sudo(['ip', 'route', 'del', `${ip}/32`, 'dev', dev]).catch(() => {});
        await this.runner.sudo(['ip', 'route', 'del', ip, 'dev', dev]).catch(() => {});
    }

    _resolveDomainIps(domain) {
        const ips = new Set();

        const getent = execSync(['getent', 'ahostsv4', domain]);
        if (getent.success) {
            for (const line of getent.stdout.split('\n')) {
                const ip = line.trim().split(/\s+/)[0];
                if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip))
                    ips.add(ip);
            }
        }

        if (!ips.size) {
            const query = execSync(['resolvectl', 'query', domain, '--cache=no']);
            if (query.success) {
                for (const line of query.stdout.split('\n')) {
                    const match = line.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
                    if (match) ips.add(match[1]);
                }
            }
        }

        return [...ips];
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

            const template = variants.find(v => Number(v.metric ?? 0) === metric) || variants[0];

            for (const route of variants) {
                const del = await this.runner.sudo(this._buildDeleteArgv(route, iface));
                if (!del.success)
                    this.logger.warn(`Failed to delete route ${route.dst}: ${del.stderr}`);
            }

            await this.runner.sudo(['ip', 'route', 'del', template.dst, 'dev', iface]).catch(() => {});

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
        this._cancelMetricRetry();

        for (const entry of this._managedRoutes) {
            try {
                const argv = ['ip', 'route', 'del', `${entry.ip}/32`];
                if (entry.gateway)
                    argv.push('via', entry.gateway);
                argv.push('dev', entry.dev);
                if (entry.metric != null)
                    argv.push('metric', String(entry.metric));
                await this.runner.sudo(argv);
            } catch (e) {}
        }
        this._managedRoutes = [];

        if (!this._applied) return;

        const iface = this.network.interfaceName();
        try {
            await this.runner.sudo(['resolvectl', 'revert', iface]);
        } catch (e) {}

        this._applied = false;
    }
}
