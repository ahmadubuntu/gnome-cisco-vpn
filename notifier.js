// notifier.js

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class Notifier {
    constructor(title = 'Cisco VPN') {
        this._title = title;
    }

    notify(message) {
        Main.notify(this._title, message);
    }

    connected() {
        this.notify('VPN connected');
    }

    connecting() {
        this.notify('Connecting...');
    }

    disconnected() {
        this.notify('VPN disconnected');
    }

    connectionLost() {
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
        this.notify(message);
    }

    ipCopied(ip) {
        this.notify(`VPN IP copied: ${ip}`);
    }
}