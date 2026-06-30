// secretManager.js

export default class SecretManager {
    constructor(commandRunner) {
        this.runner = commandRunner;
    }

    async get(account) {
        try {
            return await this.runner.exec([
                "secret-tool",
                "lookup",
                "service",
                "cisco-vpn",
                "account",
                account
            ]);
        } catch (e) {
            return null;
        }
    }

    async getPassword() {
        return this.get("password");
    }

    async getOtpSecret() {
        return this.get("otp-secret");
    }

    async hasPassword() {
        return (await this.getPassword()) !== null;
    }

    async hasOtpSecret() {
        return (await this.getOtpSecret()) !== null;
    }

    async validate() {
        if (!(await this.hasPassword()))
            throw new Error("VPN password not found in Secret Service");

        if (!(await this.hasOtpSecret()))
            throw new Error("OTP secret not found in Secret Service");
    }
}