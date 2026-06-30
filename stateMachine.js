// stateMachine.js

export const VPNState = Object.freeze({
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    CONNECTION_LOST: "connection-lost"
});

export default class StateMachine {
    constructor() {
        this._state = VPNState.DISCONNECTED;
    }

    get state() {
        return this._state;
    }

    setState(state) {
        this._state = state;
    }

    disconnected() {
        this._state = VPNState.DISCONNECTED;
    }

    connecting() {
        this._state = VPNState.CONNECTING;
    }

    connected() {
        this._state = VPNState.CONNECTED;
    }

    connectionLost() {
        this._state = VPNState.CONNECTION_LOST;
    }

    isDisconnected() {
        return this._state === VPNState.DISCONNECTED;
    }

    isConnecting() {
        return this._state === VPNState.CONNECTING;
    }

    isConnected() {
        return this._state === VPNState.CONNECTED;
    }

    hasConnectionLost() {
        return this._state === VPNState.CONNECTION_LOST;
    }

    canConnect() {
        return this.isDisconnected() || this.hasConnectionLost();
    }

    canDisconnect() {
        return this.isConnected();
    }

    reset() {
        this.disconnected();
    }
}