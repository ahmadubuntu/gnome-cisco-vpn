// cisco-vpn@charisma.ir/interfaceMonitor.js
import { execSync } from './utils.js';

export default class InterfaceMonitor {
    exists(name) {
        const r = execSync(['ip', '-o', 'link', 'show', name]);
        return r.success;
    }

    list() {
        const r = execSync(['ip', '-o', 'link', 'show']);
        if (!r.success) return [];
        return r.stdout.split('\n')
            .filter(line => 
                line.includes('tun') || 
                line.includes('csco') || 
                line.includes('vpn')
            )
            .map(line => line.split(':')[1]?.trim());
    }

    statistics(iface) {
        // TODO: اگر نیاز به آمار دقیق داشتی بگو
        return {};
    }

    mtu(iface) {
        return null;
    }

    address(iface) {
        const r = execSync(['ip', '-j', 'addr', 'show', iface]);
        if (!r.success) return null;
        try {
            const data = JSON.parse(r.stdout);
            return data[0]?.addr_info?.find(a => a.family === 'inet')?.local;
        } catch(e) {
            return null;
        }
    }
}