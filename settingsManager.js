export default class SettingsManager {

    constructor(settings) {
        this.settings = settings;
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
        // Must beat cscovpn0 metric for overlapping destinations.
        return Math.max(1, this.routeMetric() - 10);
    }

    forceDomains() {
        return this._parseList(this.settings.get_string("force-domains"))
            .map(d => this._normalizeDomain(d))
            .filter(Boolean);
    }

    forceRouteMetric() {
        // Must beat typical other-VPN metrics (often 50).
        try {
            const value = this.settings.get_uint("force-route-metric");
            if (Number.isFinite(value) && value > 0)
                return value;
        } catch (e) {}
        return Math.min(40, Math.max(1, this.routeMetric() - 20));
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
