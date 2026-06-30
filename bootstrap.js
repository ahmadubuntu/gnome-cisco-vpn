// cisco-vpn@charisma.ir/bootstrap.js
import Container from "./dependencyContainer.js";

import Logger from "./logger.js";
import Notifier from "./notifier.js";
import Network from "./network.js";
import VPNManager from "./vpnManager.js";
import SecretManager from "./secretManager.js";
import OTPManager from "./otpManager.js";
import CertificateManager from "./certificateManager.js";
import ProcessController from "./processController.js";
import PIDManager from "./pidManager.js";
import CommandRunner from "./commandRunner.js";
import SettingsManager from "./settingsManager.js";
import VPNSession from "./session.js";
import StateMachine from "./stateMachine.js";
import EventBus from "./events.js";
import PIDWatcher from "./pidWatcher.js";
import ReconnectManager from "./reconnectManager.js";

export function createVPN(settings) {
    const c = new Container();
    
    const events = new EventBus();
    c.register("events", events);
    
    const logger = new Logger(settings);
    c.register("logger", logger);
    
    const runner = new CommandRunner(logger);
    c.register("runner", runner);
    
    c.register("settings", new SettingsManager(settings));
    c.register("secret", new SecretManager(runner));
    c.register("otp", new OTPManager(runner));
    c.register("certificate", new CertificateManager());
    c.register("pid", new PIDManager());
    c.register("process", new ProcessController(runner));
    c.register("network", new Network(runner));
    c.register("session", new VPNSession());
    c.register("state", new StateMachine());
    c.register("notifier", new Notifier());

    // Reconnect Manager
    const vpnManager = new VPNManager(c);           // اول VPNManager ساخته شود
    c.register("vpn", vpnManager);

    const reconnect = new ReconnectManager(vpnManager, events);
    c.register("reconnect", reconnect);

    // PID Watcher
    const pidWatcher = new PIDWatcher(events);
    c.register("pidWatcher", pidWatcher);

    return vpnManager;
}

export const Config = {
    monitorInterval: 3,
    reconnect: true,
    debug: false,
    notification: true
};