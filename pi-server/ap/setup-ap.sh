#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# No apt install, no dhcpcd. NM handles DHCP/NAT via ipv4.method shared.
set -euo pipefail

# Remove stale AP connection if it exists
nmcli con delete "RetrosPiCam-Setup" 2>/dev/null || true

# Create hotspot — NM handles IP assignment + dnsmasq automatically
nmcli con add \
    type wifi \
    ifname wlan0 \
    con-name "RetrosPiCam-Setup" \
    autoconnect no \
    ssid "RetrosPiCam-Setup" \
    mode ap \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "retrospicam1234" \
    ipv4.method shared \
    ipv4.addresses "192.168.4.1/24"

nmcli con up "RetrosPiCam-Setup"

echo "AP configured. RetrosPiCam-Setup available at 192.168.4.1"
