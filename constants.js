// cisco-vpn@charisma.ir/constants.js
export const VPNState = Object.freeze({
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    DISCONNECTING: "disconnecting",
    FAILED: "failed",
    CONNECTION_LOST: "connection_lost",
});

export const NotificationType = Object.freeze({
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    LOST: 'lost',
    FAILED: 'failed',
});

export const Paths = Object.freeze({
    PID_FILE: '/tmp/openconnect-cisco.pid',
});

export const Monitor = Object.freeze({
    STATUS_INTERVAL: 5,
});

export const Icons = Object.freeze({
    CONNECTED: 'connected.svg',
    DISCONNECTED: 'disconnected.svg',
    CONNECTING: 'connecting.svg',
    RECONNECTING: 'reconnecting.svg',
    ERROR: 'error.svg',
});

export const OpenConnect = Object.freeze({
    USER_AGENT: 'AnyConnect',
    PROTOCOL: 'anyconnect',
    DEFAULT_GATEWAY: 'safehome.charisma.ir:37891',
});

export const Events = Object.freeze({
    STATE_CHANGED: 'state-changed',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    CONNECTION_LOST: 'connection-lost',
    ERROR: 'error'
});