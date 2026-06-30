import { exec } from './utils.js';

export default class CertificateManager {
    async fetch(host) {
        const script =
            `echo | openssl s_client -connect ${host}:37891 -servername ${host} 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`;

        const pin =
            await exec([
                'bash',
                '-c',
                script
            ]);
        return 'pin-sha256:' + pin;
    }
}