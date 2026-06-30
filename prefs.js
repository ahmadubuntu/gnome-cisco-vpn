// cisco-vpn@charisma.ir/prefs.js
import Adw from 'gi://Adw';
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

export default class CiscoVPNPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Cisco VPN Settings' });

        this._settings = this.getSettings();
        this._secretEntries = [];

        // Dependencies
        this._addDependenciesSection(group);

        // Main Settings
        this._addEntryRow(group, 'Gateway', 'gateway', 'safehome.charisma.ir:37891');
        this._addEntryRow(group, 'Username', 'username', '');

        this._addSecretRow(group, 'Password', 'password');
        this._addSecretRow(group, 'OTP Secret (Base32)', 'otp-secret');

        this._addCertPinRow(group);

        // Save Button
        const saveRow = new Adw.ActionRow({ title: 'Save Settings' });
        const saveBtn = new Gtk.Button({
            label: '💾 Save All',
            halign: Gtk.Align.END
        });
        saveBtn.add_css_class('suggested-action');
        saveBtn.connect('clicked', () => this._saveAll());
        saveRow.add_suffix(saveBtn);
        group.add(saveRow);

        this._statusRow = new Adw.ActionRow({ title: 'Status' });
        this._statusLabel = new Gtk.Label({ label: '' });
        this._statusRow.add_suffix(this._statusLabel);
        group.add(this._statusRow);

        page.add(group);
        window.add(page);
    }

    _addDependenciesSection(group) {
        const row = new Adw.ActionRow({
            title: 'Required Packages',
            subtitle: 'openconnect, oathtool, gir1.2-secret-1, openssl'
        });
        group.add(row);
    }

    _addEntryRow(group, title, key, placeholder) {
        const row = new Adw.EntryRow({ title });
        row.set_text(this._settings.get_string(key) || '');
        row.connect('changed', () => {
            this._settings.set_string(key, row.get_text());
        });
        group.add(row);
    }

    _addSecretRow(group, title, key) {
        const row = new Adw.PasswordEntryRow({ title });
        
        Secret.password_lookup(VPN_SCHEMA, { 'service': 'cisco-vpn', 'account': key }, null, (obj, res) => {
            try {
                const pass = Secret.password_lookup_finish(res);
                if (pass) row.set_text(pass);
            } catch (e) {}
        });

        row._key = key;
        group.add(row);
        this._secretEntries.push(row);
    }

    _addCertPinRow(group) {
        const row = new Adw.EntryRow({
            title: 'Certificate Pin',
            show_apply_button: true
        });
        
        row.set_text(this._settings.get_string('cert-pin') || '');
        this._certEntry = row;

        const fetchBtn = new Gtk.Button({ label: 'Fetch' });
        fetchBtn.connect('clicked', () => this._fetchCertificate());
        row.add_suffix(fetchBtn);

        group.add(row);
    }

    async _fetchCertificate() {
        this._statusLabel.label = 'Fetching...';
        const gateway = this._settings.get_string('gateway') || 'safehome.charisma.ir:37891';
        const host = gateway.split(':')[0];

        try {
            const proc = Gio.Subprocess.new([
                'bash', '-c',
                `echo | openssl s_client -connect ${host}:37891 -servername ${host} 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`
            ], Gio.SubprocessFlags.STDOUT_PIPE);

            const [ok, stdout] = await new Promise(resolve => {
                proc.communicate_utf8_async(null, null, () => {
                    try {
                        resolve(proc.communicate_utf8_finish());
                    } catch(e) {
                        resolve([false, '']);
                    }
                });
            });

            if (ok && stdout) {
                const pin = 'pin-sha256:' + stdout.trim();
                this._certEntry.set_text(pin);
                this._settings.set_string('cert-pin', pin);
                this._statusLabel.label = '✅ Fetched successfully';
            } else {
                this._statusLabel.label = '❌ Fetch failed';
            }
        } catch (e) {
            this._statusLabel.label = '❌ Error: ' + e.message;
        }
    }

    _saveAll() {
        this._statusLabel.label = 'Saving...';

        let count = 0;
        const total = this._secretEntries.length;

        for (const row of this._secretEntries) {
            const val = row.get_text().trim();
            const key = row._key;

            if (val) {
                Secret.password_store(VPN_SCHEMA,
                    { 'service': 'cisco-vpn', 'account': key },
                    Secret.COLLECTION_DEFAULT,
                    `Cisco VPN ${key}`,
                    val, null, () => {
                        count++;
                        if (count === total) this._showSaved();
                    });
            } else {
                count++;
                if (count === total) this._showSaved();
            }
        }

        // Save cert pin
        if (this._certEntry) {
            this._settings.set_string('cert-pin', this._certEntry.get_text());
        }
    }

    _showSaved() {
        this._statusLabel.label = '✅ All settings saved successfully!';
    }
}