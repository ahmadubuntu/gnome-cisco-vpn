// cisco-vpn@charisma.ir/processManager.js
import GLib from 'gi://GLib';

export default class ProcessManager {
    constructor(commandRunner) {
        this.runner = commandRunner;
        this._pid = null;
    }

    async spawn(argv, stdin = null) {
        // پیاده‌سازی spawn با sudo و background
        const result = await this.runner.sudo(argv, stdin);
        if (result.success) {
            // PID را از فایل می‌خوانیم
            await this._updatePid();
        }
        return result;
    }

    async terminate() {
        const pid = await this._getPid();
        if (pid) {
            await this.runner.kill(pid);
            this._pid = null;
        }
    }

    async running() {
        const pid = await this._getPid();
        if (!pid) return false;
        return await this.runner.pidExists(pid);
    }

    pid() {
        return this._pid;
    }

    async kill() {
        await this.terminate();
    }

    async exists() {
        return await this.running();
    }

    async _getPid() {
        if (this._pid) return this._pid;
        return await this._updatePid();
    }

    async _updatePid() {
        try {
            const content = await this.runner.readFile(Paths.PID_FILE);
            this._pid = parseInt(content.trim());
            return this._pid;
        } catch (e) {
            return null;
        }
    }
}