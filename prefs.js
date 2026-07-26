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
        this._settings = this.getSettings();
        this._secretEntries = [];

        window.add(this._buildConnectionPage());
        window.add(this._buildRoutingPage());
    }

    _buildConnectionPage() {
        const page = new Adw.PreferencesPage({
            title: 'Connection',
            icon_name: 'network-vpn-symbolic',
        });
        const group = new Adw.PreferencesGroup({ title: 'Cisco VPN Settings' });

        this._addDependenciesSection(group);
        this._addEntryRow(group, 'Gateway', 'gateway', 'safehome.charisma.ir:37891');
        this._addEntryRow(group, 'Username', 'username', '');
        this._addSecretRow(group, 'Password', 'password');
        this._addSecretRow(group, 'OTP Secret (Base32)', 'otp-secret');
        this._addCertPinRow(group);

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
        return page;
    }

    _buildRoutingPage() {
        const page = new Adw.PreferencesPage({
            title: 'Routing & DNS',
            icon_name: 'network-workgroup-symbolic',
        });

        const metricGroup = new Adw.PreferencesGroup({
            title: 'Route Priority',
            description: 'Lower metric wins when multiple VPNs advertise the same destination. Other clients often use 50; this extension defaults to 60.',
        });
        this._addMetricRow(metricGroup);
        page.add(metricGroup);

        const dnsGroup = new Adw.PreferencesGroup({
            title: 'DNS',
            description: 'Optional manual DNS for the VPN interface (systemd-resolved). Separate with comma or newline.',
        });
        this._addEntryRow(dnsGroup, 'Custom DNS Servers', 'custom-dns', '10.0.0.1, 10.0.0.2');
        page.add(dnsGroup);

        const routeGroup = new Adw.PreferencesGroup({
            title: 'Split Tunnel (optional)',
            description: 'Leave empty to use Cisco server defaults (recommended). Only set domains here if you need extra DNS scoping beyond what the server provides. Requires Custom DNS if VPN DNS is not auto-detected.',
        });
        this._addMultilineRow(routeGroup, 'VPN Domains', 'split-domains',
            '*.charisma.ir\n*.charisma.tech');
        page.add(routeGroup);

        const excludeGroup = new Adw.PreferencesGroup({
            title: 'Exclude Domains',
            description: 'Bypass cscovpn0 and send these domains via another interface. Only works if that interface can actually reach the host.',
        });
        this._addMultilineRow(excludeGroup, 'Excluded Domains', 'exclude-domains',
            'example.other.tld');
        this._addEntryRow(excludeGroup, 'Exclude Via Interface', 'exclude-via-interface', 'vpn0');
        page.add(excludeGroup);

        const forceGroup = new Adw.PreferencesGroup({
            title: 'Force Domains (via Cisco)',
            description: 'Force these domains through cscovpn0 with a low metric so they win over other VPNs. Use this when another VPN steals a host that only works on Cisco (e.g. mail.charisma.ir → 79.127.30.3).',
        });
        this._addMultilineRow(forceGroup, 'Force Domains', 'force-domains',
            'mail.charisma.ir');
        page.add(forceGroup);

        return page;
    }

    _addMetricRow(group) {
        const adjustment = new Gtk.Adjustment({
            lower: 1,
            upper: 9999,
            step_increment: 1,
            page_increment: 10,
            value: this._settings.get_uint('route-metric') || 60,
        });

        const row = new Adw.SpinRow({
            title: 'Route Metric',
            subtitle: 'e.g. 50 = prefer this tunnel; 60 = prefer other VPN with metric 50',
            adjustment,
        });

        this._settings.bind(
            'route-metric',
            row,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(row);
    }

    _addDependenciesSection(group) {
        const row = new Adw.ActionRow({
            title: 'Required Packages',
            subtitle: 'openconnect, oathtool, gir1.2-secret-1, openssl, resolvectl'
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

    _addMultilineRow(group, title, key, placeholder) {
        const row = new Adw.ActionRow({
            title,
            subtitle: 'Comma or newline separated',
        });

        const buffer = Gtk.TextBuffer.new(null);
        const current = this._settings.get_string(key) || '';
        buffer.set_text(current, -1);

        const view = new Gtk.TextView({
            buffer,
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            left_margin: 6,
            right_margin: 6,
            top_margin: 6,
            bottom_margin: 6,
        });
        view.set_size_request(320, 120);

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            child: view,
        });

        buffer.connect('changed', () => {
            const [start, end] = buffer.get_bounds();
            this._settings.set_string(key, buffer.get_text(start, end, false));
        });

        row.add_suffix(scrolled);
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

        if (this._certEntry) {
            this._settings.set_string('cert-pin', this._certEntry.get_text());
        }
    }

    _showSaved() {
        this._statusLabel.label = '✅ All settings saved successfully!';
    }
}
