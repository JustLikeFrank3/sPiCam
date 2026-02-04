#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y hostapd dnsmasq

sudo systemctl stop hostapd || true
sudo systemctl stop dnsmasq || true

sudo cp /etc/dhcpcd.conf /etc/dhcpcd.conf.bak || true
if ! grep -q "interface wlan0" /etc/dhcpcd.conf; then
  cat << 'EOF' | sudo tee -a /etc/dhcpcd.conf

interface wlan0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF
fi

sudo cp /etc/dnsmasq.conf /etc/dnsmasq.conf.bak || true
sudo tee /etc/dnsmasq.conf > /dev/null << 'EOF'
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.50,255.255.255.0,24h
domain-needed
bogus-priv
EOF

sudo tee /etc/hostapd/hostapd.conf > /dev/null << 'EOF'
interface=wlan0
ssid=PiCam
hw_mode=g
channel=6
wpa=2
wpa_passphrase=picam1234
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

sudo sed -i.bak 's|^#DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd

sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq
sudo systemctl restart dhcpcd
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

echo "AP configured. Reboot recommended."