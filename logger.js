// logger.js

export default class Logger {
    constructor(settings = null) {
        this._settings = settings;
    }

    _enabled() {
        if (!this._settings)
            return true;

        try {
            return this._settings.get_boolean('debug');
        } catch (e) {
            return true;
        }
    }

    _write(level, message) {
        if (level === 'DEBUG' && !this._enabled())
            return;

        const text = `[CiscoVPN][${level}] ${message}`;

        switch (level) {
            case 'ERROR':
                console.error(text);
                break;
            case 'WARN':
                console.warn(text);
                break;
            default:
                console.log(text);
        }
    }

    debug(message) {
        this._write('DEBUG', message);
    }

    info(message) {
        this._write('INFO', message);
    }

    warn(message) {
        this._write('WARN', message);
    }

    error(error) {
        if (error instanceof Error) {
            this._write('ERROR', error.message);

            if (error.stack)
                console.error(error.stack);

            return;
        }

        this._write('ERROR', String(error));
    }
}