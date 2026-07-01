#!/usr/bin/env bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

EXTENSION_NAME="Cisco VPN Connector"
EXTENSION_UUID="cisco-vpn@charisma.ir"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
CURRENT_USER="$(whoami)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

print_step() {
    echo -e "\n${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

run_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        print_info "[dry-run] $*"
    else
        "$@"
    fi
}

if [[ "$EUID" -eq 0 ]]; then
    print_error "Please run this script as a normal user."
    exit 1
fi

print_step "Preparing installation for $EXTENSION_NAME"
print_info "Extension directory: $EXTENSION_DIR"
print_info "Script directory: $SCRIPT_DIR"

if [[ ! -f "$SCRIPT_DIR/metadata.json" ]]; then
    print_error "Extension files were not found in the current directory."
    exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
    print_error "sudo is required but was not found."
    exit 1
fi

if [[ "$DRY_RUN" != true ]]; then
    sudo -v
fi

if command -v gnome-shell >/dev/null 2>&1; then
    GNOME_VERSION_RAW="$(gnome-shell --version 2>/dev/null || true)"
    GNOME_VERSION="$(printf '%s\n' "$GNOME_VERSION_RAW" | grep -oE '[0-9]+(\.[0-9]+)?' | head -n1 | cut -d. -f1 || true)"
else
    GNOME_VERSION=""
fi

if [[ -z "$GNOME_VERSION" ]]; then
    print_warning "GNOME Shell version could not be detected; continuing anyway."
elif [[ "$GNOME_VERSION" -lt 45 ]]; then
    print_error "GNOME Shell $GNOME_VERSION is not supported. Please use GNOME 45 or newer."
    exit 1
else
    print_success "GNOME Shell $GNOME_VERSION detected."
fi

print_step "Detecting package manager"
if command -v apt-get >/dev/null 2>&1 || command -v apt >/dev/null 2>&1; then
    PKG_MANAGER="apt"
    SECRET_PACKAGE="gir1.2-secret-1"
    SCHEMA_PACKAGE="libglib2.0-bin"
elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
    SECRET_PACKAGE="libsecret"
    SCHEMA_PACKAGE="glib2"
elif command -v pacman >/dev/null 2>&1; then
    PKG_MANAGER="pacman"
    SECRET_PACKAGE="libsecret"
    SCHEMA_PACKAGE="glib2"
elif command -v zypper >/dev/null 2>&1; then
    PKG_MANAGER="zypper"
    SECRET_PACKAGE="libsecret-devel"
    SCHEMA_PACKAGE="glib2"
else
    print_error "Unsupported package manager. Install the required packages manually."
    exit 1
fi
print_info "Using package manager: $PKG_MANAGER"

packages_to_install=()
for pkg in oathtool openssl openconnect; do
    if ! command -v "$pkg" >/dev/null 2>&1; then
        packages_to_install+=("$pkg")
    fi
done

if ! command -v secret-tool >/dev/null 2>&1; then
    packages_to_install+=("$SECRET_PACKAGE")
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    packages_to_install+=("$SCHEMA_PACKAGE")
fi

print_step "Installing required packages"
if [[ ${#packages_to_install[@]} -eq 0 ]]; then
    print_success "All required packages are already installed."
else
    print_info "Installing: ${packages_to_install[*]}"
    case "$PKG_MANAGER" in
        apt)
            run_cmd sudo apt update
            run_cmd sudo apt install -y --no-install-recommends "${packages_to_install[@]}"
            ;;
        dnf)
            run_cmd sudo dnf install -y "${packages_to_install[@]}"
            ;;
        pacman)
            run_cmd sudo pacman -S --noconfirm "${packages_to_install[@]}"
            ;;
        zypper)
            run_cmd sudo zypper install -y "${packages_to_install[@]}"
            ;;
    esac
    print_success "Packages installed successfully."
fi

print_step "Configuring passwordless sudo access"
OPENCONNECT_PATH="$(command -v openconnect 2>/dev/null || true)"
KILLALL_PATH="$(command -v killall 2>/dev/null || true)"
if [[ -z "$OPENCONNECT_PATH" ]]; then
    OPENCONNECT_PATH="/usr/sbin/openconnect"
fi
if [[ -z "$KILLALL_PATH" ]]; then
    KILLALL_PATH="/usr/bin/killall"
fi
SUDOERS_FILE="/etc/sudoers.d/cisco-vpn"
SUDOERS_CONTENT="$CURRENT_USER ALL=(ALL) NOPASSWD: $OPENCONNECT_PATH, $KILLALL_PATH"

if [[ "$DRY_RUN" == true ]]; then
    print_info "[dry-run] would write sudoers entry to $SUDOERS_FILE"
else
    printf '%s\n' "$SUDOERS_CONTENT" | sudo tee "$SUDOERS_FILE" >/dev/null
    sudo chmod 0440 "$SUDOERS_FILE"
fi
print_info "Using sudoers entry: $SUDOERS_CONTENT"

if [[ "$DRY_RUN" == true ]]; then
    print_info "[dry-run] would verify sudo access with sudo -n true"
else
    if sudo -n true >/dev/null 2>&1; then
        print_success "Sudo access verified."
    else
        print_warning "Sudo verification failed; you may need to log out and back in."
    fi
fi

print_step "Installing the GNOME extension"
mkdir -p "$HOME/.local/share/gnome-shell/extensions"

if [[ -d "$EXTENSION_DIR" ]]; then
    print_info "Removing previous installation"
    rm -rf "$EXTENSION_DIR"
fi

print_info "Copying extension files"
if [[ "$DRY_RUN" == true ]]; then
    print_info "[dry-run] would copy $SCRIPT_DIR to $EXTENSION_DIR"
else
    mkdir -p "$EXTENSION_DIR"
    cp -a "$SCRIPT_DIR"/. "$EXTENSION_DIR"/
fi

print_info "Removing temporary and unnecessary files"
if [[ "$DRY_RUN" != true ]]; then
    rm -f "$EXTENSION_DIR/INSTALL.sh"
    rm -f "$EXTENSION_DIR/run.sh"
    rm -f "$EXTENSION_DIR/README.md"
    rm -f "$EXTENSION_DIR/CHANGELOG.md"
    rm -f "$EXTENSION_DIR/LICENSE"
    rm -rf "$EXTENSION_DIR/.git"
    rm -rf "$EXTENSION_DIR/.gitignore"
fi

if [[ -d "$EXTENSION_DIR/schemas" ]]; then
    print_step "Compiling GSettings schemas"
    if [[ "$DRY_RUN" == true ]]; then
        print_info "[dry-run] would run glib-compile-schemas"
    else
        if command -v glib-compile-schemas >/dev/null 2>&1; then
            (cd "$EXTENSION_DIR" && glib-compile-schemas schemas/)
            print_success "Schemas compiled successfully."
        else
            print_warning "glib-compile-schemas is not available; skipping schema compilation."
        fi
    fi
fi

print_step "Enabling the extension"
if [[ "$DRY_RUN" == true ]]; then
    print_info "[dry-run] would enable $EXTENSION_UUID"
else
    if command -v gnome-extensions >/dev/null 2>&1; then
        gnome-extensions enable "$EXTENSION_UUID" >/dev/null 2>&1 || true
    elif command -v gsettings >/dev/null 2>&1; then
        gsettings set org.gnome.shell enabled-extensions "['$EXTENSION_UUID']" >/dev/null 2>&1 || true
    fi
fi

print_success "Installation completed."

echo -e "\n${YELLOW}Next steps:${NC}"
echo "• Log out and log back in, or press Alt+F2 and run 'r' on X11"
echo "• Open the Extensions app and verify that '$EXTENSION_UUID' is enabled"
echo "• If needed, test the sudo rule with: sudo -n openconnect --help"
