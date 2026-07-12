import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class Notifier {
    constructor(title = 'Cisco VPN') {
        this._title = title;
        this._connectedTimeout = 0;
    }

    _cancelConnected() {
        if (!this._connectedTimeout) return;
        GLib.source_remove(this._connectedTimeout);
        this._connectedTimeout = 0;
    }

    notify(message) {
        Main.notify(this._title, message);
    }

    connected() {
        // GNOME Shell 46 queues rapid banners; delay avoids stale "connected"
        // appearing only after a later notification flushes the queue.
        this._cancelConnected();
        this._connectedTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._connectedTimeout = 0;
            this.notify('VPN connected');
            return GLib.SOURCE_REMOVE;
        });
    }

    connecting() {
        this.notify('Connecting...');
    }

    disconnected() {
        this._cancelConnected();
        this.notify('VPN disconnected');
    }

    connectionLost() {
        this._cancelConnected();
        this.notify('VPN connection lost');
    }

    authenticationFailed() {
        this.notify('Authentication failed');
    }

    certificateError() {
        this.notify('Certificate verification failed');
    }

    configurationError() {
        this.notify('Configuration is incomplete');
    }

    dependencyMissing(name) {
        this.notify(`${name} is not installed`);
    }

    error(message) {
        this._cancelConnected();
        this.notify(message);
    }

    ipCopied(ip) {
        this.notify(`VPN IP copied: ${ip}`);
    }
}
