// cisco-vpn@charisma.ir/session.js
export default class VPNSession {
    constructor() {
        this.reset();
    }

    start(gateway = '', ip = '') {
        this.connectedAt = new Date();
        this.disconnectedAt = null;
        this.gateway = gateway;
        this.ip = ip;
        this.lastError = null;
        this.reconnectCount = 0;
    }

    stop() {
        this.disconnectedAt = new Date();
    }

    reset() {
        this.connectedAt = null;
        this.disconnectedAt = null;
        this.gateway = '';
        this.ip = '';
        this.lastError = null;
        this.reconnectCount = 0;
        this.bytesIn = 0;
        this.bytesOut = 0;
    }

    setIp(ip) {
        this.ip = ip;
    }

    setGateway(gateway) {
        this.gateway = gateway;
    }

    setError(error) {
        this.lastError = error;
    }

    incrementReconnect() {
        this.reconnectCount++;
    }

    isConnected() {
        return this.connectedAt !== null && this.disconnectedAt === null;
    }

    getDuration() {
        if (!this.isConnected()) return '00:00:00';

        const seconds = Math.floor((Date.now() - this.connectedAt.getTime()) / 1000);
        const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
}