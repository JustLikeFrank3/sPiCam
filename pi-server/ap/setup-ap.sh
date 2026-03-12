#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# Runs as root via ExecStartPre=+ in retrospicam.service
set -euo pipefail

SSID="RetrosPiCam-Setup"
PASSWORD="retrospicam1234"

# If the AP connection already exists and is active, nothing to do
if nmcli con show --active 2>/dev/null | grep -q "$SSID"; then
    echo "AP already active, nothing to do."
    exit 0
fi

# Remove stale connection if present
nmcli con delete "$SSID" 2>/dev/null || true

# Disconnect wlan0 from any current connection
nmcli dev disconnect wlan0 2>/dev/null || true
sleep 1

# Create AP connection with high autoconnect priority so NM always restores
# it in preference to home WiFi — avoids AP going down when service crashes
nmcli con add \
    type wifi \
    ifname wlan0 \
    con-name "$SSID" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 \
    connection.autoconnect-retries -1 \
    ssid "$SSID" \
    mode ap \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    ipv4.method shared \
    ipv4.addresses "192.168.4.1/24"

# Activate it immediately
nmcli con up "$SSID"

echo "AP active. $SSID broadcasting at 192.168.4.1"
