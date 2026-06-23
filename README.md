# Cisco VPN Connector for GNOME

A GNOME Shell extension that connects to Cisco AnyConnect VPN with TOTP (Time-based One-Time Password) support.

![Connected](https://img.shields.io/badge/status-connected-red)
![Disconnected](https://img.shields.io/badge/status-disconnected-gray)

---

## Features

- 🔒 **Secure credential storage** — Passwords and OTP secrets are stored in GNOME Keyring
- ⏱️ **Auto TOTP generation** — Automatically generates OTP codes using `oathtool`
- 🔴 **Visual status indicator** — Red icon when connected, gray when disconnected
- 🖱️ **One-click connect/disconnect** — Click the **C** icon in the top panel
- 🔐 **Auto certificate fetch** — Automatically fetches and stores the server certificate pin
- 🌐 **IPv6 disabled by default** — Compatible with Cisco ASA servers that only support IPv4

---

## Security Considerations

- Password is required for running openconnect with sudo

---

## Screenshots

| Disconnected | Connected | Settings |
|-------------|-----------|----------|
| Gray **C** icon | Red **C** icon | Gateway, Username, Password, OTP Secret |

---

## Requirements

- GNOME Shell 45 or 46 (Ubuntu 24.04+)
- `oathtool` — for TOTP generation
- `openssl` — for certificate pin fetching
- `openconnect` — for VPN connection
- `gir1.2-secret-1` — for GNOME Keyring access

```bash
sudo apt install oathtool openssl openconnect gir1.2-secret-1
```

---

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/gnome-cisco-vpn.git

# Copy to GNOME extensions directory
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r gnome-cisco-vpn ~/.local/share/gnome-shell/extensions/cisco-vpn@charisma.ir

# Compile schemas
cd ~/.local/share/gnome-shell/extensions/cisco-vpn@charisma.ir
glib-compile-schemas schemas/

# Enable the extension
gnome-extensions enable cisco-vpn@charisma.ir
```

### Restart GNOME Shell

After installation, log out and log back in.

Alternatively, on X11:

1. Press `Alt + F2`
2. Type `r`
3. Press `Enter`

---

## Configuration

1. Click the gray **C** icon in the top panel
2. Select **Settings**
3. Fill in the required fields:

| Field | Example |
|---------|---------|
| Gateway | `safehome.charisma.ir:37891` |
| Username | Your VPN username |
| Password | Your VPN password |
| OTP Secret | Your Base32 TOTP secret |
| Cert Pin | Click **Fetch** or leave empty |

4. Click **Save**

### Where to Find Your OTP Secret

The OTP Secret is the Base32-encoded key used by your authenticator application such as:

- Google Authenticator
- Microsoft Authenticator
- Authy
- FreeOTP

---

## Usage

| Action | How |
|---------|------|
| Connect | Click **C** → **Connect** |
| Disconnect | Click **C** → **Disconnect** |
| Open Settings | Click **C** → **Settings** |

---

## How It Works

When you click **Connect**, the extension:

1. Reads your password and OTP secret from secure storage
2. Generates a fresh TOTP code using `oathtool --totp -b`
3. Concatenates the password and OTP code
4. Fetches the server certificate pin if needed
5. Starts `openconnect` and supplies the combined password via standard input

The extension monitors the VPN connection every 5 seconds and updates the panel icon automatically.

---

## Technical Details

### OpenConnect Command

```bash
openconnect   --user=USERNAME   --useragent=AnyConnect   --protocol=anyconnect   --servercert=pin-sha256:...   --passwd-on-stdin   --disable-ipv6   --no-dtls   --no-external-auth   --background   safehome.charisma.ir:37891
```

### Why These Flags?

| Flag | Reason |
|--------|---------|
| `--disable-ipv6` | Cisco ASA server only supports IPv4 |
| `--no-dtls` | Prevents DTLS re-authentication issues with single-use OTPs |
| `--no-external-auth` | Disables unsupported external browser authentication |
| `--passwd-on-stdin` | Allows automated password + OTP submission |

---

## Troubleshooting

### Extension Shows an Error

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i cisco
```

### Unable to Connect

```bash
echo -n "YOUR_PASSWORD$(oathtool --totp -b YOUR_OTP_SECRET)" | sudo openconnect --user=YOUR_USER --useragent=AnyConnect --protocol=anyconnect --passwd-on-stdin --disable-ipv6 --no-dtls --no-external-auth safehome.charisma.ir:37891
```

### Verify Certificate Pin

```bash
echo | openssl s_client -connect safehome.charisma.ir:37891 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
```

### Settings Are Not Saving

```bash
secret-tool store --label="Cisco VPN" service cisco-vpn account password
```

---

## File Structure

```text
cisco-vpn@charisma.ir/
├── extension.js
├── prefs.js
├── metadata.json
├── schemas/
│   └── org.gnome.shell.extensions.cisco-vpn.gschema.xml
└── README.md
```

---

## Uninstall

```bash
gnome-extensions disable cisco-vpn@charisma.ir
rm -rf ~/.local/share/gnome-shell/extensions/cisco-vpn@charisma.ir
```

---

## License

MIT License — See LICENSE for details.

---

## Credits

- Built for Charisma VPN infrastructure
- Uses OpenConnect for VPN connectivity
- Inspired by the need for TOTP automation on Linux

---

## Contributing

Contributions welcome! If you find bugs or have feature requests, please open an issue.
