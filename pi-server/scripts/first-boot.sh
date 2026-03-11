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

# If AP is already active, skip teardown/recreate cycle
if nmcli con show --active 2>/dev/null | grep -q "RetrosPiCam-Setup"; then
    echo "[RetrosPiCam] AP already active, skipping setup."
    exit 0
fi

echo "[RetrosPiCam] No WiFi config found. Starting AP mode for setup..."
bash "$PI_SERVER_DIR/ap/setup-ap.sh"
echo "[RetrosPiCam] AP mode active. Pi reachable at 192.168.4.1:8000"
