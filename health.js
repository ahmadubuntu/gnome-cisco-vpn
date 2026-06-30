// cisco-vpn@charisma.ir/health.js
import NetworkMonitor from './network.js';
import RouteMonitor from './routeMonitor.js';

export async function health(runner) {
    const network = new NetworkMonitor();
    const route = new RouteMonitor();

    const process = await network.processExists();
    const tunnel = network.hasTunnel();
    const routeOk = route.vpnRoute().length > 0;
    const dns = route.dnsServers().length > 0;

    let latency = null;
    try {
        const ping = await runner.exec(['ping', '-c', '1', '-W', '2', '8.8.8.8']);
        const match = ping.match(/time=([\d.]+)/);
        latency = match ? parseFloat(match[1]) : null;
    } catch(e) {}

    return {
        process,
        tunnel,
        route: routeOk,
        dns,
        latency
    };
}