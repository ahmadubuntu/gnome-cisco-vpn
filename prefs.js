// prefs.js — نسخه نهایی با verify
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const VPN_SCHEMA = new Secret.Schema('org.gnome.shell.extensions.cisco-vpn',
  Secret.SchemaFlags.NONE,
  {
    'service': Secret.SchemaAttributeType.STRING,
    'account': Secret.SchemaAttributeType.STRING
  }
);

const CiscoVPNPrefs = GObject.registerClass(
  class CiscoVPNPrefs extends Gtk.Box {
    _init(prefs) {
      super._init({ orientation: Gtk.Orientation.VERTICAL, spacing: 15, margin_top: 20, margin_bottom: 20, margin_start: 20, margin_end: 20 });
      this._prefs = prefs;
      this._settings = prefs.getSettings();
      this._secretEntries = [];
      this._buildUI();
    }

    _buildUI() {
      this.append(this._makeTitle('<b>Cisco VPN Settings</b>'));
      
      const warn = new Gtk.Label({
        use_markup: true,
        label: '<span foreground="#e74c3c">⚠️ Secrets stored in GNOME Keyring only</span>',
        margin_bottom: 10
      });
      this.append(warn);

      this._addTextEntry(_('Gateway:'), 'gateway', 'safehome.charisma.ir:37891');
      this._addTextEntry(_('Username:'), 'username', '');
      this._addSecretEntry(_('Password:'), 'password');
      this._addSecretEntry(_('OTP Secret (Base32):'), 'otp-secret');

      const certBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
      certBox.append(new Gtk.Label({ label: _('Cert Pin:'), width_chars: 15, xalign: 0 }));
      this._certEntry = new Gtk.Entry({ text: this._settings.get_string('cert-pin') || '', hexpand: true, placeholder_text: _('Auto-fetch on first connect') });
      certBox.append(this._certEntry);
      const fetchBtn = new Gtk.Button({ label: _('Fetch') });
      fetchBtn.connect('clicked', () => this._fetchCert());
      certBox.append(fetchBtn);
      this.append(certBox);

      const saveBtn = new Gtk.Button({ label: _('Save to Keyring'), margin_top: 20 });
      saveBtn.connect('clicked', () => this._save());
      this.append(saveBtn);

      this._status = new Gtk.Label({ margin_top: 10 });
      this.append(this._status);
    }

    _makeTitle(text) {
      const l = new Gtk.Label({ use_markup: true, halign: Gtk.Align.START });
      l.set_markup(text);
      return l;
    }

    _addTextEntry(label, key, placeholder) {
      const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
      box.append(new Gtk.Label({ label, width_chars: 15, xalign: 0 }));
      const entry = new Gtk.Entry({ text: this._settings.get_string(key) || '', hexpand: true, placeholder_text: placeholder });
      entry.connect('changed', e => this._settings.set_string(key, e.get_text()));
      box.append(entry);
      this.append(box);
    }

    _addSecretEntry(label, key) {
      const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
      box.append(new Gtk.Label({ label, width_chars: 15, xalign: 0 }));
      const entry = new Gtk.Entry({ hexpand: true, visibility: false, input_purpose: Gtk.InputPurpose.PASSWORD });
      
      Secret.password_lookup(VPN_SCHEMA, { 'service': 'cisco-vpn', 'account': key }, null,
        (obj, res) => {
          try {
            const p = Secret.password_lookup_finish(res);
            if (p) entry.set_text(p);
          } catch (e) {}
        });
      
      entry._key = key;
      box.append(entry);
      this.append(box);
      this._secretEntries.push(entry);
    }

    async _fetchCert() {
      const host = (this._settings.get_string('gateway') || 'safehome.charisma.ir:37891').split(':')[0];
      this._status.set_text(_('Fetching...'));
      try {
        const proc = Gio.Subprocess.new(['bash', '-c',
          `echo | openssl s_client -connect ${host}:37891 -servername ${host} 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`],
          Gio.SubprocessFlags.STDOUT_PIPE);
        const pin = await new Promise((resolve, reject) => {
          proc.communicate_utf8_async(null, null, (p, res) => {
            try { resolve(proc.communicate_utf8_finish(res)[1].trim()); }
            catch (e) { reject(e); }
          });
        });
        const fullPin = 'pin-sha256:' + pin;
        this._certEntry.set_text(fullPin);
        this._settings.set_string('cert-pin', fullPin);
        this._status.set_text(_('Fetched successfully!'));
      } catch (e) {
        this._status.set_text(_('Failed: ') + e.message);
      }
    }

    _save() {
      let saved = 0;
      const total = this._secretEntries.length;
      
      for (const entry of this._secretEntries) {
        const val = entry.get_text();
        const key = entry._key;
        
        if (val && key) {
          Secret.password_store(VPN_SCHEMA, { 'service': 'cisco-vpn', 'account': key },
            Secret.COLLECTION_DEFAULT, 'Cisco VPN ' + key, val, null,
            (obj, res) => {
              try {
                Secret.password_store_finish(res);
                saved++;
                if (saved === total) this._verifySave();
              } catch (e) {
                logError(e);
                this._status.set_text(_('Error saving ') + key);
              }
            });
        } else {
          saved++;
          if (saved === total) this._verifySave();
        }
      }
      
      this._settings.set_string('cert-pin', this._certEntry.get_text());
    }

    _verifySave() {
      // Quick verify via secret-tool
      GLib.timeout_add_seconds(0, 1, () => {
        this._execAsync(['secret-tool', 'lookup', 'service', 'cisco-vpn', 'account', 'password']).then(pass => {
          if (pass) {
            this._status.set_text(_('✅ Saved and verified in Keyring!'));
          } else {
            this._status.set_text(_('⚠️ Saved but verify failed — unlock keyring?'));
          }
        });
        return GLib.SOURCE_REMOVE;
      });
    }

    _execAsync(argv) {
      return new Promise((resolve) => {
        try {
          const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE);
          proc.communicate_utf8_async(null, null, (p, res) => {
            try {
              const [, stdout] = proc.communicate_utf8_finish(res);
              resolve(stdout ? stdout.trim() : null);
            } catch (e) { resolve(null); }
          });
        } catch (e) { resolve(null); }
      });
    }
  }
);

export default class CiscoVPNPreferences extends ExtensionPreferences {
  getPreferencesWidget() {
    return new CiscoVPNPrefs(this);
  }
}
