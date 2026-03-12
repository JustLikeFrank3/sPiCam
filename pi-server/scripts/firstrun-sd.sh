#!/bin/bash
# firstrun-sd.sh — deploy AP stability fix to the Pi via SD card boot.
#
# HOW TO USE:
#   1. Shut down Pi, remove SD card, insert into Mac
#   2. cp pi-server/scripts/firstrun-sd.sh /Volumes/bootfs/firstrun.sh
#   3. Edit /Volumes/bootfs/cmdline.txt — append at the end of the single line:
#        systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=none systemd.run_failure_action=none
#   4. Eject SD card safely, reinsert into Pi, power on
#   5. This script runs once, patches files, reboots, then self-deletes
#
# WHAT IT DOES:
#   - Deploys updated setup-ap.sh (autoconnect yes + priority 100 — AP stays
#     up even if the Python service crashes)
#   - Makes systemd journal persistent so crash logs survive reboots
#   - Removes itself from cmdline.txt

set -euo pipefail

PI_SERVER="/home/fvm3/pi-server"
BOOT_CMDLINE="/boot/firmware/cmdline.txt"

echo "[firstrun-sd] Starting AP stability patch..."

# --------------------------------------------------------------------------
# 1. Remount rootfs rw (may already be rw, but be sure)
# --------------------------------------------------------------------------
mount -o remount,rw / || true

# --------------------------------------------------------------------------
# 2. Write updated setup-ap.sh
# --------------------------------------------------------------------------
cat > "${PI_SERVER}/ap/setup-ap.sh" << 'SETUP_AP'
#!/usr/bin/env bash
# RetrosPiCam AP setup — uses NetworkManager (Pi OS Bookworm)
# Runs as root via ExecStartPre=+ in retrospicam.service
set -euo pipefail

SSID="RetrosPiCam-Setup"
PASSWORD="retrospicam1234"

# If the AP connection is already active, nothing to do
if nmcli con show --active 2>/dev/null | grep -q "$SSID"; then
    echo "AP already active, nothing to do."
    exit 0
fi

# Remove stale connection if present
nmcli con delete "$SSID" 2>/dev/null || true

# Disconnect wlan0 from any current connection
nmcli dev disconnect wlan0 2>/dev/null || true
sleep 1

# Create AP connection with high autoconnect priority so NM always
# restores it in preference to home WiFi — AP stays up even if
# the Python service crashes and restarts
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
SETUP_AP

chmod +x "${PI_SERVER}/ap/setup-ap.sh"
echo "[firstrun-sd] setup-ap.sh updated."

# --------------------------------------------------------------------------
# 3. Make systemd journal persistent so crash logs survive across reboots
# --------------------------------------------------------------------------
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal || true
# Tell journald to use persistent storage
if [ -f /etc/systemd/journald.conf ]; then
    sed -i 's/^#*Storage=.*/Storage=persistent/' /etc/systemd/journald.conf
    grep -q '^Storage=' /etc/systemd/journald.conf || echo 'Storage=persistent' >> /etc/systemd/journald.conf
else
    echo '[Journal]' > /etc/systemd/journald.conf
    echo 'Storage=persistent' >> /etc/systemd/journald.conf
fi
echo "[firstrun-sd] Persistent journal enabled."

# --------------------------------------------------------------------------
# 4. Remove ourselves from cmdline.txt so we don't run again
# --------------------------------------------------------------------------
sed -i 's| systemd\.run=[^ ]*||g;s| systemd\.run_success_action=[^ ]*||g;s| systemd\.run_failure_action=[^ ]*||g' "$BOOT_CMDLINE"
rm -f /boot/firmware/firstrun.sh
echo "[firstrun-sd] Cleaned up cmdline.txt and firstrun.sh."

# --------------------------------------------------------------------------
# 5. Reboot into the fixed AP mode
# --------------------------------------------------------------------------
echo "[firstrun-sd] All patches applied. Rebooting..."
reboot
