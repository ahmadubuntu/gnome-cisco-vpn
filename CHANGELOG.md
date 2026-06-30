# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-06-30

### Added
- Modular architecture with dedicated managers for VPN, networking, secrets, OTP, notifications, logging, and state management.
- Centralized `CommandRunner` for all command execution with error handling and timeout support.
- Connection state machine with internal event bus for reliable state transitions.
- Continuous VPN monitoring with automatic connection-loss detection.
- Desktop notifications for connect, disconnect, and unexpected connection loss events.
- VPN session tracking (connection time, VPN IP, and session metadata).
- Improved process and PID lifecycle management.
- Comprehensive dependency validation and runtime error handling.

### Changed
- Refactored codebase to reduce coupling between UI and backend components.
- Improved overall maintainability and extensibility for future features.

### Deprecated
- Nothing.

### Removed
- Nothing.

### Fixed
- Various edge cases in connection state handling and process cleanup.

### Security
- Nothing.

---



## [1.2.0] - 2026-06-23

### Added
- Persistent connection state across GNOME Shell restarts
- PID file tracking to detect only OUR openconnect process
- `sudo -n` support with `sudoers` rule (no password prompts)
- Charisma-style SVG icon (C letter with green/red states)
- `_isOurProcessRunning()` to ignore other VPN connections
- `_cleanupPidFile()` for stale PID cleanup

### Changed
- Replaced `pkexec` with `sudo -n` for connect/disconnect
- Updated icon colors: green background + red C when connected
- State detection now specific to extension's own process

### Fixed
- Connection state correctly shows after `Alt+F2` → `r` restart
- No longer falsely shows connected when other VPN is active
- Disconnect properly cleans up PID file
- `sudoers` path corrected to `/usr/sbin/openconnect`

---

## [1.1.0] - 2026-06-23

### Added
- CHANGELOG.md file

---

## [1.0.0] - 2026-06-22

### Added
- Initial release
- Cisco AnyConnect VPN connection via `openconnect`
- TOTP/OTP auto-generation using `oathtool`
- Secure credential storage in GNOME Keyring
- SVG icon with C logo
- Visual status indicator (gray/red icon)
- One-click connect/disconnect from system tray
- Auto certificate pin fetching
- Settings GUI with gateway, username, password, OTP secret
- IPv6 disabled, DTLS disabled for Cisco ASA compatibility
