// extension.js — نسخه با persist وضعیت
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const CiscoVPNIndicator = GObject.registerClass(
  class CiscoVPNIndicator extends PanelMenu.Button {
    _init(extension) {
      super._init(0.0, 'Cisco VPN');
      this._extension = extension;
      this._settings = extension.getSettings();
      this._vpnProcess = null;
      this._isConnected = false;
      this._monitorId = null;
      
      const extDir = extension.dir.get_path();
      this._iconDisconnected = Gio.File.new_for_path(extDir + '/icons/disconnected.svg');
      this._iconConnected = Gio.File.new_for_path(extDir + '/icons/connected.svg');
      
      this._buildUI();
      
      // Check initial state from system
      this._checkInitialState();
      
      this._monitorConnection();
    }

    _buildUI() {
      this._icon = new St.Icon({
        style_class: 'system-status-icon',
        icon_size: 22
      });
      this.add_child(this._icon);

      this._statusItem = new PopupMenu.PopupMenuItem(_('Status: Disconnected'), { reactive: false });
      this.menu.addMenuItem(this._statusItem);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this._toggleItem = new PopupMenu.PopupMenuItem(_('Connect'));
      this._toggleItem.connect('activate', () => this._toggleVPN());
      this.menu.addMenuItem(this._toggleItem);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
      settingsItem.connect('activate', () => this._extension.openPreferences());
      this.menu.addMenuItem(settingsItem);
    }

    _checkInitialState() {
      // Check if any VPN tunnel interface exists
      const interfaces = this._getVpnInterfaces();
      this._isConnected = interfaces.length > 0;
      
      // If connected, try to find the process
      if (this._isConnected) {
        try {
          GLib.spawn_command_line_sync('pgrep -f "openconnect.*safehome.charisma.ir"');
          // Process exists, set state
          this._vpnProcess = { pid: 1 }; // dummy to enable monitoring
        } catch (e) {
          // Process not found but interface exists (maybe from before reboot?)
          this._vpnProcess = null;
        }
      }
      
      this._updateIcon();
    }

    _getVpnInterfaces() {
      try {
        const [ok, out] = GLib.spawn_command_line_sync("ip -o link show");
        if (!ok) return [];
        const text = new TextDecoder().decode(out);
        // Look for tun, cscotun, vpn interfaces
        const vpnIfs = text.split('\n').filter(line => 
          /tun|csco|vpn/.test(line)
        );
        return vpnIfs;
      } catch (e) {
        return [];
      }
    }

    _updateIcon() {
      if (!this._icon || !this._statusItem || !this._toggleItem) return;
      
      const file = this._isConnected ? this._iconConnected : this._iconDisconnected;
      const iconFile = new Gio.FileIcon({ file });
      this._icon.gicon = iconFile;
      
      this._statusItem.label.text = _('Status: ') + (this._isConnected ? _('Connected') : _('Disconnected'));
      this._toggleItem.label.text = this._isConnected ? _('Disconnect') : _('Connect');
    }

    _toggleVPN() {
      if (this._isConnected) this._disconnect();
      else this._connect();
    }

    async _connect() {
      try {
        const username = this._settings.get_string('username');
        const gateway = this._settings.get_string('gateway') || 'safehome.charisma.ir:37891';
        const password = await this._readSecret('password');
        const otpSecret = await this._readSecret('otp-secret');

        if (!username || !password || !otpSecret) {
          Main.notify(_('Cisco VPN'), _('Please configure settings first'));
          this._extension.openPreferences();
          return;
        }

        const otp = await this._execAsync(['oathtool', '--totp', '-b', otpSecret]);
        const combined = password + otp;
        let certPin = this._settings.get_string('cert-pin');

        if (!certPin) {
          certPin = await this._fetchCertPin(gateway.split(':')[0]);
          if (certPin) this._settings.set_string('cert-pin', certPin);
        }

        const cmd = ['pkexec', 'openconnect', '--user=' + username, '--useragent=AnyConnect',
          '--protocol=anyconnect', '--passwd-on-stdin', '--disable-ipv6', '--no-dtls',
          '--no-external-auth', '--background', '--pid-file=/tmp/openconnect-cisco.pid'];

        if (certPin) cmd.splice(3, 0, '--servercert=' + certPin);
        cmd.push(gateway);

        const proc = Gio.Subprocess.new(cmd, Gio.SubprocessFlags.STDIN_PIPE);
        const stdin = proc.get_stdin_pipe();
        stdin.write_bytes(new TextEncoder().encode(combined + '\n'), null);
        stdin.close(null);
        this._vpnProcess = proc;

        GLib.timeout_add_seconds(0, 2, () => { this._checkStatus(); return GLib.SOURCE_REMOVE; });
        Main.notify(_('Cisco VPN'), _('Connecting...'));

      } catch (e) {
        Main.notify(_('Cisco VPN'), _('Error: ') + e.message);
        logError(e);
      }
    }

    _disconnect() {
      try {
        GLib.spawn_command_line_async('pkexec killall openconnect');
        const pidFile = Gio.File.new_for_path('/tmp/openconnect-cisco.pid');
        if (pidFile.query_exists(null)) pidFile.delete(null);
      } catch (e) {}
      this._setDisconnected();
      Main.notify(_('Cisco VPN'), _('Disconnected'));
    }

    _setDisconnected() {
      this._isConnected = false;
      this._vpnProcess = null;
      this._updateIcon();
    }

    _checkStatus() {
      const interfaces = this._getVpnInterfaces();
      const wasConnected = this._isConnected;
      this._isConnected = interfaces.length > 0;
      
      // If state changed, update
      if (wasConnected !== this._isConnected) {
        if (!this._isConnected) {
          this._vpnProcess = null;
        }
        this._updateIcon();
      }
    }

    _monitorConnection() {
      this._monitorId = GLib.timeout_add_seconds(0, 5, () => {
        this._checkStatus();
        return GLib.SOURCE_CONTINUE;
      });
    }

    _execAsync(argv) {
      return new Promise((resolve, reject) => {
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE);
        proc.communicate_utf8_async(null, null, (p, res) => {
          try { resolve(proc.communicate_utf8_finish(res)[1].trim()); }
          catch (e) { reject(e); }
        });
      });
    }

    async _fetchCertPin(hostname) {
      const script = `echo | openssl s_client -connect ${hostname}:37891 -servername ${hostname} 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`;
      try {
        const pin = await this._execAsync(['bash', '-c', script]);
        return 'pin-sha256:' + pin;
      } catch (e) { return null; }
    }

    async _readSecret(account) {
      try {
        const result = await this._execAsync([
          'secret-tool', 'lookup',
          'service', 'cisco-vpn',
          'account', account
        ]);
        return result || null;
      } catch (e) {
        logError(e, 'Failed to read secret for ' + account);
        return null;
      }
    }

    destroy() {
      if (this._monitorId) GLib.source_remove(this._monitorId);
      if (this._vpnProcess) this._disconnect();
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
    this._indicator.destroy();
    this._indicator = null;
  }
}
