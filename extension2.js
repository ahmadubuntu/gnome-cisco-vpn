// cisco-vpn@charisma.ir/extension.js
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {createVPN} from "./bootstrap.js";
import {Icons} from './constants.js';

const CiscoVPNIndicator = GObject.registerClass(
    class CiscoVPNIndicator extends PanelMenu.Button {
        _init(extension) {
            super._init(0.0, 'Cisco VPN');

            this._extension = extension;
            this._vpn = createVPN(extension.getSettings());

            this._buildUI();
            this._checkInitialState();
            this._startMonitor();
        }

        _buildUI() {
            this._icon = new St.Icon({
                style_class: 'system-status-icon',
                icon_size: 22
            });
            this.add_child(this._icon);

            this._statusItem = new PopupMenu.PopupMenuItem('Status: Disconnected', { reactive: false });
            this.menu.addMenuItem(this._statusItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._durationItem = new PopupMenu.PopupMenuItem('Duration: 00:00:00', { reactive: false });
            this.menu.addMenuItem(this._durationItem);

            this._ipItem = new PopupMenu.PopupMenuItem('IP: -', { reactive: true });
            this._ipItem.connect('activate', () => this._copyIP());
            this.menu.addMenuItem(this._ipItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._toggleItem = new PopupMenu.PopupMenuItem('Connect');
            this._toggleItem.connect('activate', () => this._toggleVPN());
            this.menu.addMenuItem(this._toggleItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const settingsItem = new PopupMenu.PopupMenuItem('Settings');
            settingsItem.connect('activate', () => this._extension.openPreferences());
            this.menu.addMenuItem(settingsItem);

            this._updateUI();
        }

        _copyIP() {
            if (this._vpn.session?.ip) {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._vpn.session.ip);
                this._vpn.notifier?.notify('VPN IP copied to clipboard');
            }
        }

        _toggleVPN() {
            if (this._vpn.state?.isConnected()) {
                this._vpn.disconnect();
            } else {
                this._vpn.connect().catch(e => console.error(e));
            }
        }

        _updateUI() {
            const isConnected = this._vpn.state?.isConnected() || false;
            const ip = this._vpn.session?.ip || '-';

            // Update icon
            const extDir = this._extension.dir.get_path();
            const iconName = isConnected ? Icons.CONNECTED : Icons.DISCONNECTED;
            const file = Gio.File.new_for_path(`${extDir}/icons/${iconName}`);
            this._icon.gicon = new Gio.FileIcon({ file });

            // Update menu items
            this._statusItem.label.text = `Status: ${isConnected ? 'Connected' : 'Disconnected'}`;
            this._toggleItem.label.text = isConnected ? 'Disconnect' : 'Connect';
            this._durationItem.label.text = `Duration: ${this._vpn.session?.getDuration() || '00:00:00'}`;
            this._ipItem.label.text = `IP: ${ip}`;
        }

        _checkInitialState() {
            if (this._vpn.network?.connected()) {
                this._vpn.state?.connected();
                // Try to get IP
                this._vpn.network.getVpnIp().then(ip => {
                    if (ip) this._vpn.session.setIp(ip);
                });
            }
            this._updateUI();
        }

        _startMonitor() {
            this._monitorId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                this._updateStatus();
                return GLib.SOURCE_CONTINUE;
            });
        }

        _updateStatus() {
            const currentlyConnected = this._vpn.network?.connected() || false;
            const stateConnected = this._vpn.state?.isConnected() || false;

            if (currentlyConnected !== stateConnected) {
                if (currentlyConnected) {
                    this._vpn.state.connected();
                    this._vpn.network.getVpnIp().then(ip => {
                        if (ip) this._vpn.session.setIp(ip);
                    });
                } else {
                    this._vpn.state.disconnected();
                }
            }

            this._updateUI();
        }

        destroy() {
            if (this._monitorId) GLib.source_remove(this._monitorId);
            super.destroy();
        }
    }
);

export default class CiscoVPNExtension extends Extension {
    enable() {
        this._indicator = new CiscoVPNIndicator(this);
        Main.panel.addToStatusArea('cisco-vpn', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}