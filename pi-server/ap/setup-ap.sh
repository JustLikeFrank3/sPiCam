#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# No apt install, no dhcpcd. NM handles DHCP/NAT automatically.
set -euo pipefail

SSID="RetrosPiCam-Setup"
PASSWORD="retrospicam1234"

# Tear down any stale AP connection
nmcli con delete "$SSID" 2>/dev/null || true

# Prevent NetworkManager from auto-reconnecting home WiFi after we disconnect wlan0
for CON in $(nmcli -t -f NAME,TYPE con show | grep ':wifi$' | cut -d: -f1); do
    nmcli con modify "$CON" connection.autoconnect no 2>/dev/null || true
done

# Now disconnect wlan0 — NM won't fight us back
nmcli dev disconnect wlan0 2>/dev/null || true
sleep 1

# Bring up hotspot — band bg forces 2.4 GHz so all phones can see it
nmcli device wifi hotspot \
    ifname wlan0 \
    con-name "$SSID" \
    ssid "$SSID" \
    band bg \
    password "$PASSWORD"

# Pin static gateway IP
nmcli con modify "$SSID" \
    ipv4.addresses "192.168.4.1/24" \
    ipv4.method shared

nmcli con up "$SSID"

echo "AP active. $SSID broadcasting at 192.168.4.1"
