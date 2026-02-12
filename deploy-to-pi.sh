#!/bin/bash
# Deploy sPiCam pi-server to Raspberry Pi

# Configuration - Set these via environment variables:
#   export PI_HOST=192.168.68.71
#   export PI_USER=fvm3
#   export PI_PATH=~/spicam
#   ./deploy-to-pi.sh

PI_HOST="${PI_HOST:-192.168.68.71}"  # Local IP (use PI_HOST=100.86.177.103 for Tailscale)
PI_USER="${PI_USER:-fvm3}"  # Change to your Pi username
PI_PATH="${PI_PATH:-~/pi-server}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== sPiCam Deployment Script ===${NC}"
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
echo -e "${YELLOW}Restarting service on Pi...${NC}"

ssh "${PI_USER}@${PI_HOST}" << 'ENDSSH'
    cd ~/pi-server
    
    # Check if running as systemd service
    if systemctl is-active --quiet spicam.service 2>/dev/null; then
        echo "Restarting systemd service..."
        sudo systemctl restart spicam.service
        sudo systemctl status spicam.service --no-pager
    # Check if running in screen/tmux
    elif screen -ls | grep -q spicam; then
        echo "Found screen session, sending quit command..."
        screen -S spicam -X stuff "^C"
        sleep 2
        screen -S spicam -X stuff "source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000\n"
    else
        echo "No running service detected."
        echo "To start manually:"
        echo "  cd ~/spicam"
        echo "  source .venv/bin/activate"
        echo "  uvicorn main:app --host 0.0.0.0 --port 8000"
    fi
ENDSSH

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Key changes deployed:"
echo "  ✓ Persistent USB camera connection (no more reopening)"
echo "  ✓ Optimized settings (640x480@15fps)"
echo "  ✓ Reduced motion detection CPU usage"
echo "  ✓ Lower JPEG quality for streaming (70%)"
echo ""
echo "Monitor the server:"
echo "  ssh ${PI_USER}@${PI_HOST}"
echo "  htop              # Check CPU usage"
echo "  journalctl -u spicam.service -f   # If running as service"
