// events.js

export default class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, callback) {
        if (!this._listeners.has(event))
            this._listeners.set(event, []);

        this._listeners.get(event).push(callback);

        return callback;
    }

    off(event, callback) {
        if (!this._listeners.has(event))
            return;

        const listeners = this._listeners.get(event);
        const index = listeners.indexOf(callback);

        if (index >= 0)
            listeners.splice(index, 1);

        if (listeners.length === 0)
            this._listeners.delete(event);
    }

    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback(...args);
        };

        this.on(event, wrapper);
    }

    emit(event, ...args) {
        if (!this._listeners.has(event))
            return;

        for (const callback of [...this._listeners.get(event)]) {
            try {
                callback(...args);
            } catch (e) {
                logError(e);
            }
        }
    }

    clear(event = null) {
        if (event === null) {
            this._listeners.clear();
            return;
        }

        this._listeners.delete(event);
    }

    listenerCount(event) {
        if (!this._listeners.has(event))
            return 0;

        return this._listeners.get(event).length;
    }

    hasListeners(event) {
        return this.listenerCount(event) > 0;
    }
}