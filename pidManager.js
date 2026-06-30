import GLib from 'gi://GLib';
import { Paths } from './constants.js';

export default class PIDManager {

    read() {

        try {

            return Number(
                GLib.file_get_contents(
                    Paths.PID_FILE
                )[1]
            );

        }
        catch {

            return null;

        }

    }

    exists() {

        return this.read() !== null;

    }

    delete() {

        try {

            GLib.unlink(
                Paths.PID_FILE
            );

        }
        catch {}

    }

}