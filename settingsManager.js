import { OpenConnect, Paths } from './constants.js';

export default class SettingsManager {

    constructor(settings) {
        this.settings = settings;
        this._domainRoutesMigrated = false;
    }

    username() {
        return this.settings.get_string("username");
    }

    gateway() {
        return this.settings.get_string("gateway")
            || "safehome.charisma.ir:37891";
    }

    certificate() {
        return this.settings.get_string("cert-pin");
    }

    saveCertificate(pin) {
        this.settings.set_string("cert-pin", pin);
    }

    customDns() {
        return this._parseList(this.settings.get_string("custom-dns"));
    }

    splitDomains() {
        return this._parseList(this.settings.get_string("split-domains"))
            .map(d => this._normalizeDomain(d))
            .filter(Boolean);
    }

    splitTunnelEnabled() {
        return this.splitDomains().length > 0;
    }

    routeMetric() {
        try {
            const value = this.settings.get_uint("route-metric");
            return Number.isFinite(value) && value > 0 ? value : 60;
        } catch (e) {
            return 60;
        }
    }

    excludeDomains() {
        return this._parseList(this.settings.get_string("exclude-domains"))
            .map(d => this._normalizeDomain(d))
            .filter(Boolean);
    }

    excludeViaInterface() {
        return (this.settings.get_string("exclude-via-interface") || '').trim();
    }

    excludeRouteMetric() {
        return Math.max(1, this.routeMetric() - 10);
    }

    forceDomains() {
        return this._parseList(this.settings.get_string("force-domains"))
            .map(d => this._normalizeDomain(d))
            .filter(Boolean);
    }

    forceRouteMetric() {
        try {
            const value = this.settings.get_uint("force-route-metric");
            if (Number.isFinite(value) && value > 0)
                return value;
        } catch (e) {}
        return Math.min(40, Math.max(1, this.routeMetric() - 20));
    }

    autoReconnect() {
        try {
            return this.settings.get_boolean("auto-reconnect");
        } catch (e) {
            return true;
        }
    }

    reconnectMaxFailures() {
        try {
            const value = this.settings.get_uint("reconnect-max-failures");
            return Number.isFinite(value) && value > 0 ? value : 5;
        } catch (e) {
            return 5;
        }
    }

    autoConnect() {
        try {
            return this.settings.get_boolean("auto-connect");
        } catch (e) {
            return false;
        }
    }

    openconnectExtraArgs() {
        try {
            const value = this.settings.get_string("openconnect-extra-args");
            if (value != null && value !== '')
                return value;
        } catch (e) {}
        return OpenConnect.DEFAULT_EXTRA_ARGS;
    }

    resetOpenconnectExtraArgs() {
        this.settings.set_string("openconnect-extra-args", OpenConnect.DEFAULT_EXTRA_ARGS);
    }

    /**
     * @returns {{domain: string, iface: string}[]}
     */
    domainRoutes() {
        this._ensureDomainRoutesMigrated();
        return this._parseDomainRoutes(this.settings.get_string("domain-routes") || '');
    }

    domainRoutesRaw() {
        this._ensureDomainRoutesMigrated();
        return this.settings.get_string("domain-routes") || '';
    }

    ciscoInterfaceName() {
        return Paths.INTERFACE_NAME;
    }

    _ensureDomainRoutesMigrated() {
        if (this._domainRoutesMigrated)
            return;
        this._domainRoutesMigrated = true;

        const existing = (this.settings.get_string("domain-routes") || '').trim();
        if (existing)
            return;

        const lines = [];
        const via = this.excludeViaInterface() || 'vpn0';
        for (const domain of this.excludeDomains())
            lines.push(`${domain} = ${via}`);
        for (const domain of this.forceDomains())
            lines.push(`${domain} = ${Paths.INTERFACE_NAME}`);

        if (!lines.length)
            return;

        this.settings.set_string("domain-routes", lines.join('\n'));
    }

    _parseDomainRoutes(text) {
        const rules = [];
        const seen = new Set();

        for (const rawLine of text.split('\n')) {
            const line = rawLine.replace(/#.*$/, '').trim();
            if (!line)
                continue;

            const match = line.match(/^(.+?)\s*=\s*(\S+)\s*$/);
            if (!match)
                continue;

            const domain = this._normalizeDomain(match[1]);
            const iface = match[2].trim();
            if (!domain || !iface)
                continue;

            const key = `${domain}|${iface}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            rules.push({ domain, iface });
        }

        return rules;
    }

    _normalizeDomain(domain) {
        let d = domain.trim().toLowerCase();
        if (d.startsWith('*.'))
            d = d.slice(2);
        if (d.startsWith('~'))
            d = d.slice(1);
        return d;
    }

    _parseList(value) {
        if (!value) return [];
        return [...new Set(
            value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
        )];
    }
}
