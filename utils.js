import Gio from 'gi://Gio';

export async function exec(argv, stdin = null) {

    return new Promise((resolve, reject) => {

        let flags =
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE;

        if (stdin !== null)
            flags |= Gio.SubprocessFlags.STDIN_PIPE;

        const proc = Gio.Subprocess.new(argv, flags);

        proc.communicate_utf8_async(stdin, null, (p, res) => {

            try {

                const [, stdout, stderr] =
                    proc.communicate_utf8_finish(res);

                if (proc.get_successful())
                    resolve(stdout.trim());
                else
                    reject(new Error(stderr.trim()));

            } catch (e) {
                reject(e);
            }

        });

    });

}

export function execSync(argv) {

    const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE |
        Gio.SubprocessFlags.STDERR_PIPE
    );

    const [, stdout, stderr] =
        proc.communicate_utf8(null, null);

    return {
        success: proc.get_successful(),
        stdout: stdout.trim(),
        stderr: stderr.trim()
    };

}