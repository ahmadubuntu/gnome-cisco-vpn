// otpManager.js

export default class OTPManager {
    constructor(commandRunner) {
        this.runner = commandRunner;
    }

    async generate(secret) {
        if (!secret)
            throw new Error("OTP secret is empty");

        const otp = await this.runner.exec([
            "oathtool",
            "--totp",
            "-b",
            secret
        ]);

        if (!otp)
            throw new Error("Failed to generate OTP");

        return otp.trim();
    }

    async generateFromSecretManager(secretManager) {
        const secret =
            await secretManager.getOtpSecret();

        return this.generate(secret);
    }

    async validate(secret) {
        const otp =
            await this.generate(secret);

        return otp.length === 6;
    }

    async remainingSeconds() {
        const now =
            Math.floor(Date.now() / 1000);

        return 30 - (now % 30);
    }

    async currentCode(secret) {
        return this.generate(secret);
    }
}