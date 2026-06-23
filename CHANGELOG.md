# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-06-23

### Added
- Persistent connection state across GNOME Shell restarts
- Auto-detection of VPN interface on extension load
- `CHANGELOG.md` file

### Fixed
- Connection state now correctly shows after `Alt+F2` → `r` restart
- State persists correctly after system reboot

---

## [1.0.0] - 2026-06-22

### Added
- Initial release
- Cisco AnyConnect VPN connection via `openconnect`
- TOTP/OTP auto-generation using `oathtool`
- Secure credential storage in GNOME Keyring
- SVG icon with Charisma-style "C" logo
- Visual status indicator (green/red icon)
- One-click connect/disconnect from system tray
- Auto certificate pin fetching
- Settings GUI with gateway, username, password, OTP secret
- IPv6 disabled, DTLS disabled for compatibility with Cisco ASA
