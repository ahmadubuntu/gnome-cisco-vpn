// cisco-vpn@charisma.ir/pidWatcher.js
import Gio from 'gi://Gio';
import { Paths } from './constants.js';

export default class PIDWatcher {
    constructor(events) {
        this.events = events;
        this.monitor = null;
    }

    start() {
        const file = Gio.File.new_for_path(Paths.PID_FILE);
        try {
            this.monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this.monitor.connect('changed', (_, __, ___, eventType) => {
                this.events.emit('pid-file-changed', eventType);
            });
        } catch (e) {
            console.error("PIDWatcher:", e);
        }
    }

    stop() {
        if (this.monitor) {
            this.monitor.cancel();
            this.monitor = null;
        }
    }
}