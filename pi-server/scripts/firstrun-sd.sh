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
SETUP_AP

chmod +x "${PI_SERVER}/ap/setup-ap.sh"
echo "[firstrun-sd] setup-ap.sh updated."

# --------------------------------------------------------------------------
# 3. Write updated first-boot.sh (remove stale "already active" skip)
# --------------------------------------------------------------------------
cat > "${PI_SERVER}/scripts/first-boot.sh" << 'FIRST_BOOT'
#!/usr/bin/env bash
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
FIRST_BOOT

chmod +x "${PI_SERVER}/scripts/first-boot.sh"
echo "[firstrun-sd] first-boot.sh updated."

# --------------------------------------------------------------------------
# 3. Delete the stale RetrosPiCam-Setup NM profile FILE directly.
#    nmcli requires NM to be running — it isn't yet during systemd.run.
#    Deleting the file works at any boot stage.
#    After the reboot (step 6), NM starts fresh with no RetrosPiCam-Setup
#    profile, so first-boot.sh will run setup-ap.sh and create it correctly.
# --------------------------------------------------------------------------
rm -f /etc/NetworkManager/system-connections/RetrosPiCam-Setup.nmconnection 2>/dev/null || true
rm -f "/etc/NetworkManager/system-connections/RetrosPiCam-Setup" 2>/dev/null || true
echo "[firstrun-sd] Stale AP profile file deleted."

# Re-enable autoconnect on all other WiFi profiles by editing their files directly
# (nmcli not available at this boot stage)
for f in /etc/NetworkManager/system-connections/*.nmconnection /etc/NetworkManager/system-connections/*; do
    [ -f "$f" ] || continue
    grep -q 'mode=ap' "$f" 2>/dev/null && continue  # skip AP profiles
    sed -i 's/^autoconnect=false$/autoconnect=true/' "$f" 2>/dev/null || true
done
echo "[firstrun-sd] Home WiFi autoconnect re-enabled in profile files."

# --------------------------------------------------------------------------
# 4. Make systemd journal persistent so crash logs survive across reboots
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
# 5. Remove ourselves from cmdline.txt so we don't run again
# --------------------------------------------------------------------------
sed -i 's| systemd\.run=[^ ]*||g;s| systemd\.run_success_action=[^ ]*||g;s| systemd\.run_failure_action=[^ ]*||g' "$BOOT_CMDLINE"
rm -f /boot/firmware/firstrun.sh
echo "[firstrun-sd] Cleaned up cmdline.txt and firstrun.sh."

# --------------------------------------------------------------------------
# 6. Reboot into the fixed AP mode
# --------------------------------------------------------------------------
echo "[firstrun-sd] All patches applied. Rebooting..."
reboot
