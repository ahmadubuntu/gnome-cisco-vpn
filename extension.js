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
      
      // Build UI first
      this._buildUI();
      // Then update icon
      this._updateIcon();
      // Then start monitoring
      this._monitorConnection();
    }

    _buildUI() {
      this._drawingArea = new St.DrawingArea({ width: 20, height: 20 });
      this._drawingArea.connect('repaint', () => this._drawIcon());
      this.add_child(this._drawingArea);

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

    _drawIcon() {
      const cr = this._drawingArea.get_context();
      const w = this._drawingArea.get_width();
      const h = this._drawingArea.get_height();
      const active = this._isConnected;

      cr.arc(w / 2, h / 2, 9, 0, 2 * Math.PI);
      cr.setSourceRGBA(active ? 0.9 : 0.58, active ? 0.3 : 0.63, active ? 0.24 : 0.65, 1);
      cr.fill();

      cr.setSourceRGBA(1, 1, 1, 1);
      cr.selectFontFace('Sans', 0, 1);
      cr.setFontSize(12);
      const ext = cr.textExtents('C');
      cr.moveTo((w - ext.width) / 2 - ext.x_bearing, (h + ext.height) / 2 - ext.y_bearing);
      cr.showText('C');
    }

    _updateIcon() {
      if (!this._drawingArea || !this._statusItem || !this._toggleItem) {
        return;
      }
      this._drawingArea.queue_repaint();
      this._statusItem.label.text = _('Status: ') + (this._isConnected ? _('Connected') : _('Disconnected'));
      this._toggleItem.label.text = this._isConnected ? _('Disconnect') : _('Connect');
    }

    _toggleVPN() {
      if (this._isConnected) {
        this._disconnect();
      } else {
        this._connect();
      }
    }

    async _connect() {
      try {
        const username = this._settings.get_string('username');
        const gateway = this._settings.get_string('gateway') || 'safehome.charisma.ir:37891';
        const password = this._readSecret('password');
        const otpSecret = this._readSecret('otp-secret');

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
      try {
        GLib.spawn_command_line_sync('ip link show tun0');
        this._isConnected = true;
      } catch (e) {
        try {
          const [ok, out] = GLib.spawn_command_line_sync("ip -o link show | grep -E 'tun|csco'");
          this._isConnected = ok && out.length > 0;
        } catch (e2) {
          this._isConnected = false;
        }
      }
      this._updateIcon();
    }

    _monitorConnection() {
      this._monitorId = GLib.timeout_add_seconds(0, 5, () => {
        if (this._vpnProcess) this._checkStatus();
        return GLib.SOURCE_CONTINUE;
      });
    }

    _execAsync(argv) {
      return new Promise((resolve, reject) => {
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE);
        proc.communicate_utf8_async(null, null, (p, res) => {
          try {
            const [, stdout] = proc.communicate_utf8_finish(res);
            resolve(stdout.trim());
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    async _fetchCertPin(hostname) {
      const script = `echo | openssl s_client -connect ${hostname}:37891 -servername ${hostname} 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`;
      try {
        const pin = await this._execAsync(['bash', '-c', script]);
        return 'pin-sha256:' + pin;
      } catch (e) {
        return null;
      }
    }

    _readSecret(key) {
      const file = Gio.File.new_for_path(GLib.get_home_dir() + '/.config/cisco-vpn/' + key);
      try {
        const [, contents] = file.load_contents(null);
        return new TextDecoder().decode(contents).trim();
      } catch (e) {
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
