// cisco-vpn@charisma.ir/routeMonitor.js
import { execSync } from './utils.js';

export default class RouteMonitor {
    defaultRoute() {
        const r = execSync(['ip', 'route', 'show', 'default']);
        return r.success ? r.stdout.trim() : '';
    }

    vpnRoute() {
        const r = execSync(['ip', 'route', 'show']);
        if (!r.success) return '';
        return r.stdout.split('\n')
            .find(line => line.includes('tun') || line.includes('csco') || line.includes('vpn')) || '';
    }

    dnsServers() {
        const r = execSync(['cat', '/etc/resolv.conf']);
        if (!r.success) return [];
        return r.stdout.match(/nameserver\s+(\S+)/g) || [];
    }

    gateway() {
        const r = execSync(['ip', 'route', 'show', 'default']);
        if (!r.success) return null;
        const match = r.stdout.match(/via\s+([0-9.]+)/);
        return match ? match[1] : null;
    }
}