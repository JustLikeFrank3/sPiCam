#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# Runs as root via ExecStartPre=+ in retrospicam.service
set -euo pipefail

SSID="RetrosPiCam-Setup"
PASSWORD="retrospicam1234"

# Remove stale connection if present
nmcli con delete "$SSID" 2>/dev/null || true

# Disable autoconnect on all existing WiFi connections so NM won't
# fight us back after we disconnect wlan0
for CON in $(nmcli -t -f NAME,TYPE con show | grep ':wifi$' | cut -d: -f1); do
    nmcli con modify "$CON" connection.autoconnect no 2>/dev/null || true
done

# Disconnect wlan0 from home WiFi
nmcli dev disconnect wlan0 2>/dev/null || true
sleep 1

# Create AP connection with the correct static IP — no post-modify needed,
# so there is no IP-flap between 10.42.0.1 and 192.168.4.1
nmcli con add \
    type wifi \
    ifname wlan0 \
    con-name "$SSID" \
    autoconnect no \
    ssid "$SSID" \
    mode ap \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    ipv4.method shared \
    ipv4.addresses "192.168.4.1/24"

# Activate it
nmcli con up "$SSID"

echo "AP active. $SSID broadcasting at 192.168.4.1"
