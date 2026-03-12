#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# Runs as root via ExecStartPre=+ in retrospicam.service
set -euo pipefail

SSID="RetrosPiCam-Setup"
PASSWORD="retrospicam1234"

# Always delete and recreate the AP profile so the password is always correct.
# Do NOT add an early "already active" check here — that would skip the delete
# and leave a stale profile with the wrong password in place.
nmcli con delete "$SSID" 2>/dev/null || true

# Disable autoconnect on ALL other WiFi connections so home WiFi can never
# race back while we are in setup mode. _delayed_reboot() re-enables them
# before rebooting after the user provides credentials.
for CON in $(nmcli -t -f NAME,TYPE con show | grep ':wifi$' | cut -d: -f1); do
    nmcli con modify "$CON" connection.autoconnect no 2>/dev/null || true
done

# Create AP connection — autoconnect yes + priority 100 keeps NM from
# switching away from the AP if the service restarts
nmcli con add \
    type wifi \
    ifname wlan0 \
    con-name "$SSID" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 \
    ssid "$SSID" \
    mode ap \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    ipv4.method shared \
    ipv4.addresses "192.168.4.1/24"

# Bring it up
nmcli con up "$SSID"

echo "AP active. $SSID broadcasting at 192.168.4.1"
