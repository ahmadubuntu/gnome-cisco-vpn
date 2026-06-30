export default class VPNSession {

    constructor() {
        this.pid = null;
        this.interface = null;
        this.gateway = null;
        this.connectedAt = null;
        this.ip = null;
        this.bytesIn = 0;
        this.bytesOut = 0;
        this.reconnectCount = 0;
    }

    reset() {

        this.pid = null;
        this.interface = null;
        this.gateway = null;
        this.connectedAt = null;
        this.ip = null;
        this.bytesIn = 0;
        this.bytesOut = 0;

    }

}


// downloadBytes

// uploadBytes

// connectionCount

// lastFailure

// lastDisconnectReason

// lastLatency

// lastReconnect

// lastConnected