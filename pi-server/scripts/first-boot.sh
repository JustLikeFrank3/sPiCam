#!/usr/bin/env bash
# RetrosPiCam first-boot setup checker
#
# Runs as ExecStartPre in the retrospicam.service unit.
# If WiFi has not been provisioned yet, starts AP mode (RetrosPiCam-Setup)
# so the mobile app can connect and complete the WiFi setup wizard.
# The pi-server itself always starts regardless, serving /setup/* endpoints
# at 192.168.4.1:8000 while in AP mode.

set -euo pipefail

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
PI_SERVER_DIR="$(realpath "$SCRIPT_DIR/..")"
MARKER="$PI_SERVER_DIR/.wifi_configured"

if [ -f "$MARKER" ]; then
    echo "[RetrosPiCam] WiFi provisioned. Starting in normal mode."
    exit 0
fi

# If the AP profile already exists, just ensure it's active.
# Do NOT call setup-ap.sh (which deletes the active connection) on every
# service restart — that creates an NM race window on each restart cycle.
if nmcli con show 2>/dev/null | grep -qw "RetrosPiCam-Setup"; then
    if nmcli con show --active 2>/dev/null | grep -qw "RetrosPiCam-Setup"; then
        echo "[RetrosPiCam] AP already active."
    else
        echo "[RetrosPiCam] AP profile exists, bringing up..."
        nmcli con up "RetrosPiCam-Setup" 2>/dev/null || true
    fi
    exit 0
fi

# No AP profile at all — first time in setup mode, run full setup.
echo "[RetrosPiCam] No WiFi config found. Starting AP mode for setup..."
bash "$PI_SERVER_DIR/ap/setup-ap.sh"
echo "[RetrosPiCam] AP mode active. Pi reachable at 192.168.4.1:8000"
