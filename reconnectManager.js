// cisco-vpn@charisma.ir/reconnectManager.js
import GLib from 'gi://GLib';

export default class ReconnectManager {
    constructor(vpnManager, events) {
        this.vpn = vpnManager;
        this.events = events;
        this.delay = 5;
        this.failures = 0;
        this.maxFailures = 5;
        this._timeoutId = null;
    }

    scheduleReconnect() {
        if (this.failures >= this.maxFailures) {
            console.warn("ReconnectManager: Too many failures, stopping auto-reconnect");
            return;
        }

        this.failures++;
        const backoff = Math.min(this.delay * this.failures, 30);

        console.log(`ReconnectManager: Scheduling reconnect in ${backoff} seconds`);

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, backoff, () => {
            if (!this.vpn.state.isConnected()) {
                this.vpn.connect().catch(e => console.error(e));
            }
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
}