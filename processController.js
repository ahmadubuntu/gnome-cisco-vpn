export default class ProcessController {

    constructor(runner) {

        this.runner = runner;

    }

    async terminate(pid) {

        return this.runner.sudo([
            "kill",
            pid.toString()
        ]);

    }

    async exists(pid) {

        try {

            await this.runner.run([
                "ps",
                "-p",
                pid.toString()
            ]);

            return true;

        }
        catch {

            return false;

        }

    }

}