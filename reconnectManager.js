// cisco-vpn@charisma.ir/reconnectManager.js
import GLib from 'gi://GLib';

export default class ReconnectManager {
    constructor(vpnManager, events) {
        this.vpn = vpnManager;
        this.events = events;
        this.delay = 5;
        this.failures = 0;
        this._timeoutId = null;
    }

    get maxFailures() {
        try {
            return this.vpn.settings.reconnectMaxFailures();
        } catch (e) {
            return 5;
        }
    }

    scheduleReconnect() {
        if (this._timeoutId)
            return;

        if (this.failures >= this.maxFailures) {
            console.warn("ReconnectManager: Too many failures, stopping auto-reconnect");
            this.vpn.logger?.warn("Auto-reconnect stopped after too many failures");
            this.vpn.notifier?.error("Auto-reconnect stopped after too many failures");
            return;
        }

        this.failures++;
        const backoff = Math.min(this.delay * this.failures, 30);

        this.vpn.logger?.info(`Scheduling reconnect in ${backoff}s (attempt ${this.failures}/${this.maxFailures})`);

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, backoff, () => {
            this._timeoutId = null;
            if (this.vpn.state.isConnected() || this.vpn.state.isConnecting())
                return GLib.SOURCE_REMOVE;

            this.vpn.connect().catch(e => console.error(e));
            return GLib.SOURCE_REMOVE;
        });
    }

    reset() {
        this.failures = 0;
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    cancel() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }
}
