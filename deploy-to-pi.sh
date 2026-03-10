#!/bin/bash
# Deploy RetrosPiCam pi-server to Raspberry Pi

# Configuration - Set these via environment variables:
#   export PI_HOST=192.168.68.71
#   export PI_USER=fvm3
#   export PI_PATH=~/retrospicam
#   ./deploy-to-pi.sh

PI_HOST="${PI_HOST:-192.168.68.52}"  # Local IP (use PI_HOST=100.86.177.103 for Tailscale)
PI_USER="${PI_USER:-fvm3}"  # Change to your Pi username
PI_PATH="${PI_PATH:-~/pi-server}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== RetrosPiCam Deployment Script ===${NC}"
echo ""
echo "Target: ${PI_USER}@${PI_HOST}:${PI_PATH}"
echo ""

# Check if we can reach the Pi
echo -e "${YELLOW}Checking connection to Pi...${NC}"
if ! ping -c 1 -W 2 "$PI_HOST" &> /dev/null; then
    echo -e "${RED}Cannot reach Pi at $PI_HOST${NC}"
    echo "Try setting PI_HOST environment variable:"
    echo "  export PI_HOST=192.168.1.100"
    echo "  ./deploy-to-pi.sh"
    exit 1
fi
echo -e "${GREEN}✓ Pi is reachable${NC}"
echo ""

# Sync pi-server directory
echo -e "${YELLOW}Syncing pi-server files...${NC}"
rsync -avz --progress \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='media/*' \
    pi-server/ "${PI_USER}@${PI_HOST}:${PI_PATH}/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Files synced successfully${NC}"
else
    echo -e "${RED}✗ Sync failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Installing dependencies on Pi...${NC}"

ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
    cd ~/pi-server
    source .venv/bin/activate
    pip install -r requirements.txt
ENDSSH

echo ""
echo -e "${YELLOW}Patching systemd unit (rename to retrospicam.service + ExecStartPre)...${NC}"

ssh "${PI_USER}@${PI_HOST}" << ENDSSH
    PI_RESOLVED=\$(eval echo "${PI_PATH}")
    FIRST_BOOT_SCRIPT="\${PI_RESOLVED}/scripts/first-boot.sh"
    TARGET=/etc/systemd/system/retrospicam.service

    chmod +x "\${FIRST_BOOT_SCRIPT}"

    # Migrate spicam.service → retrospicam.service if needed
    if ! systemctl list-unit-files retrospicam.service 2>/dev/null | grep -q retrospicam.service; then
        if systemctl list-unit-files spicam.service 2>/dev/null | grep -q spicam.service; then
            OLD_FILE=\$(systemctl show -p FragmentPath spicam.service | cut -d= -f2)
            echo "Migrating \$OLD_FILE → \$TARGET ..."
            sudo cp "\$OLD_FILE" "\$TARGET"
            sudo systemctl disable spicam.service
            sudo rm -f "\$OLD_FILE"
            echo "✓ Renamed spicam.service → retrospicam.service"
        else
            echo "No known service unit found — skipping"
        fi
    else
        echo "retrospicam.service already exists"
    fi

    # Ensure ExecStartPre is present in retrospicam.service
    if [ -f "\$TARGET" ]; then
        # Fix description if still showing old name
        sudo sed -i "s|^Description=.*|Description=RetrosPiCam Server|" "\$TARGET"

        if grep -q "^ExecStartPre=+" "\$TARGET"; then
            echo "ExecStartPre already present with + privilege — no change needed"
        elif grep -q "ExecStartPre" "\$TARGET"; then
            echo "Patching ExecStartPre to add + privilege prefix ..."
            sudo sed -i 's|^ExecStartPre=\([^+]\)|ExecStartPre=+\1|' "\$TARGET"
            echo "✓ ExecStartPre patched with +"
        else
            echo "Inserting ExecStartPre=+\${FIRST_BOOT_SCRIPT} ..."
            sudo sed -i "s|^ExecStart=|ExecStartPre=+\${FIRST_BOOT_SCRIPT}\nExecStart=|" "\$TARGET"
            echo "✓ ExecStartPre added"
        fi
        sudo systemctl daemon-reload
        sudo systemctl enable retrospicam.service
        echo "✓ daemon-reloaded"
    fi

    # If we can reach the Pi over the network, WiFi is already configured
    touch "\${PI_RESOLVED}/.wifi_configured"
    echo "✓ .wifi_configured marker ensured"
ENDSSH

echo ""
echo -e "${YELLOW}Restarting retrospicam.service on Pi...${NC}"

ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
    sudo systemctl restart retrospicam.service
    sudo systemctl status retrospicam.service --no-pager
ENDSSH

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Changes deployed:"
echo "  ✓ AP provisioning setup wizard (setup_service, routers/setup)"
echo "  ✓ first-boot.sh (starts AP mode if .wifi_configured missing)"
echo "  ✓ ExecStartPre wired into retrospicam.service"
echo "  ✓ Hardware factory reset (shutter 10s hold / GPIO 27 pin)"
echo "  ✓ RetrosPiCam rebranding in logs + AP SSID"
echo ""
echo "Monitor the server:"
echo "  ssh ${PI_USER}@${PI_HOST}"
echo "  journalctl -u retrospicam.service -f"
