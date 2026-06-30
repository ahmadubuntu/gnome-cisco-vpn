#!/bin/bash

# ============================================
# Cisco VPN Connector - GNOME Extension Installer
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EXTENSION_NAME="Cisco VPN Connector"
EXTENSION_UUID="cisco-vpn@charisma.ir"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
CURRENT_USER=$(whoami)

# ASCII Art Banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║     Cisco VPN Connector - Installer      ║"
echo "║     GNOME Shell Extension                ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Helper functions
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

# Check if running as root (we shouldn't be)
if [ "$EUID" -eq 0 ]; then
    print_error "Please run this script as a normal user, not root."
    echo "The script will ask for sudo password when needed."
    exit 1
fi

# ============================================
# Step 1: Check GNOME Shell version
# ============================================
print_step "Checking GNOME Shell version..."

GNOME_VERSION=$(gnome-shell --version 2>/dev/null | grep -oP '\d+\.\d+' | cut -d'.' -f1)

if [ -z "$GNOME_VERSION" ]; then
    print_warning "Could not detect GNOME Shell version."
    GNOME_VERSION=0
fi

if [ "$GNOME_VERSION" -lt 45 ] && [ "$GNOME_VERSION" -ne 0 ]; then
    print_error "GNOME Shell $GNOME_VERSION detected. This extension requires version 45 or 46."
    exit 1
elif [ "$GNOME_VERSION" -eq 0 ]; then
    print_warning "Assuming GNOME Shell version is compatible..."
else
    print_success "GNOME Shell $GNOME_VERSION detected (compatible)."
fi

# ============================================
# Step 2: Install system packages
# ============================================
print_step "Installing required system packages..."

REQUIRED_PACKAGES=(
    "oathtool"
    "openssl"
    "openconnect"
)

# Check package manager
if command -v apt &> /dev/null; then
    PKG_MANAGER="apt"
    SECRET_PACKAGE="gir1.2-secret-1"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    SECRET_PACKAGE="libsecret-devel"
elif command -v pacman &> /dev/null; then
    PKG_MANAGER="pacman"
    SECRET_PACKAGE="libsecret"
elif command -v zypper &> /dev/null; then
    PKG_MANAGER="zypper"
    SECRET_PACKAGE="libsecret-devel"
else
    print_error "Unsupported package manager. Please install manually:"
    echo "  - oathtool"
    echo "  - openssl"
    echo "  - openconnect"
    echo "  - gir1.2-secret-1 (or equivalent)"
    exit 1
fi

print_info "Detected package manager: $PKG_MANAGER"

# Check and install packages
MISSING_PACKAGES=()
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! command -v "$pkg" &> /dev/null; then
        MISSING_PACKAGES+=("$pkg")
    fi
done

# Check for secret library
case $PKG_MANAGER in
    apt)
        if ! dpkg -l | grep -q "gir1.2-secret-1"; then
            MISSING_PACKAGES+=("$SECRET_PACKAGE")
        fi
        ;;
    dnf)
        if ! rpm -q "$SECRET_PACKAGE" &> /dev/null; then
            MISSING_PACKAGES+=("$SECRET_PACKAGE")
        fi
        ;;
    pacman)
        if ! pacman -Qi "$SECRET_PACKAGE" &> /dev/null; then
            MISSING_PACKAGES+=("$SECRET_PACKAGE")
        fi
        ;;
    zypper)
        if ! rpm -q "$SECRET_PACKAGE" &> /dev/null; then
            MISSING_PACKAGES+=("$SECRET_PACKAGE")
        fi
        ;;
esac

if [ ${#MISSING_PACKAGES[@]} -eq 0 ]; then
    print_success "All required packages are already installed."
else
    print_info "Installing missing packages: ${MISSING_PACKAGES[*]}"
    
    case $PKG_MANAGER in
        apt)
            sudo apt update
            sudo apt install -y "${MISSING_PACKAGES[@]}"
            ;;
        dnf)
            sudo dnf install -y "${MISSING_PACKAGES[@]}"
            ;;
        pacman)
            sudo pacman -S --noconfirm "${MISSING_PACKAGES[@]}"
            ;;
        zypper)
            sudo zypper install -y "${MISSING_PACKAGES[@]}"
            ;;
    esac
    
    print_success "Packages installed successfully."
fi

# ============================================
# Step 3: Configure sudoers for passwordless VPN
# ============================================
print_step "Configuring sudoers for passwordless VPN operations..."

# Find openconnect path
OPENCONNECT_PATH=$(which openconnect 2>/dev/null || echo "/usr/sbin/openconnect")
KILLALL_PATH=$(which killall 2>/dev/null || echo "/usr/bin/killall")

print_info "openconnect path: $OPENCONNECT_PATH"
print_info "killall path: $KILLALL_PATH"

SUDOERS_FILE="/etc/sudoers.d/cisco-vpn"
SUDOERS_CONTENT="$CURRENT_USER ALL=(ALL) NOPASSWD: $OPENCONNECT_PATH, $KILLALL_PATH"

if [ -f "$SUDOERS_FILE" ]; then
    print_info "Sudoers file already exists. Checking content..."
    if sudo grep -q "$CURRENT_USER.*NOPASSWD.*openconnect" "$SUDOERS_FILE" && \
       sudo grep -q "$CURRENT_USER.*NOPASSWD.*killall" "$SUDOERS_FILE"; then
        print_success "Sudoers configuration looks correct."
    else
        print_warning "Existing sudoers file may be incorrect."
        echo -e "${YELLOW}Current content:${NC}"
        sudo cat "$SUDOERS_FILE"
        echo ""
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "$SUDOERS_CONTENT" | sudo tee "$SUDOERS_FILE" > /dev/null
            sudo chmod 440 "$SUDOERS_FILE"
            print_success "Sudoers file updated."
        fi
    fi
else
    print_info "Creating sudoers file..."
    echo "$SUDOERS_CONTENT" | sudo tee "$SUDOERS_FILE" > /dev/null
    sudo chmod 440 "$SUDOERS_FILE"
    print_success "Sudoers file created and permissions set."
fi

# Verify sudoers
print_step "Verifying sudo configuration..."

# Test sudo access
if sudo -n true 2>/dev/null; then
    print_success "Sudo access verified."
else
    print_warning "Could not verify sudo access. You might need to log out and back in."
fi

# ============================================
# Step 4: Install the extension
# ============================================
print_step "Installing GNOME extension..."

# Get the script directory (where the extension files are)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/metadata.json" ]; then
    print_error "Extension files not found in current directory!"
    echo "Please run this script from the extension's directory."
    exit 1
fi

# Create extensions directory if it doesn't exist
mkdir -p "$HOME/.local/share/gnome-shell/extensions"

# Remove old installation if exists
if [ -d "$EXTENSION_DIR" ]; then
    print_info "Removing previous installation..."
    rm -rf "$EXTENSION_DIR"
fi

# Copy extension files
print_info "Copying extension files to $EXTENSION_DIR..."
cp -r "$SCRIPT_DIR" "$EXTENSION_DIR"

# Remove unnecessary files from extension directory
print_info "Cleaning up extension directory..."
rm -f "$EXTENSION_DIR"/install.sh
rm -f "$EXTENSION_DIR"/run.sh
rm -f "$EXTENSION_DIR"/README.md
rm -f "$EXTENSION_DIR"/CHANGELOG.md
rm -f "$EXTENSION_DIR"/LICENSE
rm -rf "$EXTENSION_DIR"/.git
rm -rf "$EXTENSION_DIR"/.gitignore

# Compile schemas if they exist
if [ -d "$EXTENSION_DIR/schemas" ]; then
    print_step "Compiling GSettings schemas..."
    
    cd "$EXTENSION_DIR"
    if command -v glib-compile-schemas &> /dev/null; then
        glib-compile-schemas schemas/
        print_success "Schemas compiled successfully."
    else
        print_warning "glib-compile-schemas not found. Installing..."
        case $PKG_MANAGER in
            apt)
                sudo apt install -y libglib2.0-dev
                ;;
            dnf)
                sudo dnf install -y glib2-devel
                ;;
            pacman)
                sudo pacman -S --noconfirm glib2
                ;;
            zypper)
                sudo zypper install -y glib2-devel
                ;;
        esac
        glib-compile-schemas schemas/
        print_success "Schemas compiled successfully."
    fi
    cd - > /dev/null
fi

print_success "Extension installed to $EXTENSION_DIR"

# ============================================
# Step 5: Enable the extension
# ============================================
print_step "Enabling the extension..."

if command -v gnome-extensions &> /dev/null; then
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || {
        print_warning "Could not enable extension via gnome-extensions."
        print_info "You can enable it manually using Extensions app."
    }
    print_success "Extension enabled."
else
    print_warning "gnome-extensions command not found."
    print_info "Please enable the extension manually."
fi

# ============================================
# Step 6: Final instructions
# ============================================
echo -e "\n${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation Complete! 🎉            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}Important:${NC}"
echo -e "1. ${BLUE}Restart GNOME Shell${NC} to complete installation:"
echo "   • Log out and log back in, OR"
echo "   • On X11: Press Alt+F2, type 'r', press Enter"
echo -e "2. ${BLUE}Verify the extension${NC} in Extensions app"
echo -e "3. ${BLUE}Check sudoers configuration${NC} (optional):"
echo "   sudo -n openconnect --help"

echo -e "\n${YELLOW}For issues:${NC}"
echo "• View logs: journalctl -f -o cat /usr/bin/gnome-shell"
echo "• Extension debug: Alt+F2 → lg → Extensions"

echo -e "\n${GREEN}Done! Enjoy your Cisco VPN Connector.${NC}\n"