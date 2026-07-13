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
