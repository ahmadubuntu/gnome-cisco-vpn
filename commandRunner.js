// cisco-vpn@charisma.ir/commandRunner.js
import Gio from 'gi://Gio';

export default class CommandRunner {
    constructor(logger = null) {
        this._logger = logger;
    }

    async run(argv, stdin = null) {
        return new Promise((resolve, reject) => {
            let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
            if (stdin !== null)
                flags |= Gio.SubprocessFlags.STDIN_PIPE;

            const proc = Gio.Subprocess.new(argv, flags);

            proc.communicate_utf8_async(stdin, null, (p, res) => {
                try {
                    const [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                    resolve({
                        success: ok,
                        stdout: stdout ? stdout.trim() : '',
                        stderr: stderr ? stderr.trim() : '',
                        exitCode: proc.get_exit_status(),
                        process: proc
                    });
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async sudo(argv, stdin = null) {
        return this.run(["sudo", "-n", ...argv], stdin);
    }

    async exists(command) {
        const result = await this.run(["which", command]);
        return result.success && result.stdout.length > 0;
    }

    async exec(argv) {
        const result = await this.run(argv);
        if (!result.success) {
            throw new Error(result.stderr || "Command failed");
        }
        return result.stdout;
    }

    async kill(pid) {
        return this.sudo(["kill", "-9", pid.toString()]);
    }

    async pidExists(pid) {
        const result = await this.run(["ps", "-p", pid.toString(), "-o", "comm="]);
        return result.success;
    }

    async processName(pid) {
        const result = await this.run(["ps", "-p", pid.toString(), "-o", "comm="]);
        return result.success ? result.stdout.trim() : null;
    }

    async readFile(path) {
        return this.exec(["cat", path]);
    }

    async removeFile(path) {
        return this.sudo(["rm", "-f", path]);
    }

    async isOpenConnectRunning(pid) {
        const name = await this.processName(pid);
        return name === "openconnect";
    }
}