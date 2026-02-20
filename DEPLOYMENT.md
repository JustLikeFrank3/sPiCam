# Deploying to Raspberry Pi

## Quick Deploy (Automated)

### 1. Configure Connection
```bash
export PI_HOST=192.168.1.100    # Or raspberrypi.local
export PI_USER=pi
export PI_PATH=~/retrospicam
```

### 2. Run Deployment Script
```bash
./deploy-to-pi.sh
```

The script will:
- Check connection to Pi
- Sync all pi-server files (excluding venv, cache, media)
- Restart the server service if running

---

## Manual Deploy Options

### Option A: Using rsync (Recommended)
```bash
# From your Mac, in the RetrosPiCam directory
rsync -avz --progress \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='media/*' \
    pi-server/ pi@raspberrypi.local:~/retrospicam/
```

Then SSH in and restart:
```bash
ssh pi@raspberrypi.local
cd ~/retrospicam
sudo systemctl restart retrospicam.service  # If using systemd
# OR
pkill -f "uvicorn main:app"  # Kill old process
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000  # Start new
```

### Option B: Using scp
```bash
# From your Mac
cd /Users/fvm3/Projects/RetrosPiCam
scp pi-server/*.py pi@raspberrypi.local:~/retrospicam/
scp pi-server/config.json pi@raspberrypi.local:~/retrospicam/
scp pi-server/requirements.txt pi@raspberrypi.local:~/retrospicam/
```

### Option C: Using Git
If you have a git repo on the Pi:
```bash
# On your Mac
git add -A
git commit -m "Optimize USB camera for Pi Zero 2 W"
git push origin main

# On Pi
ssh pi@raspberrypi.local
cd ~/retrospicam
git pull
sudo systemctl restart retrospicam.service
```

### Option D: Direct Edit on Pi
SSH into the Pi and edit files directly:
```bash
ssh pi@raspberrypi.local
cd ~/retrospicam
nano main.py  # Edit the files manually
```

---

## Verify Deployment

### Check if server is running
```bash
ssh pi@raspberrypi.local
ps aux | grep uvicorn
```

### Check systemd service status
```bash
ssh pi@raspberrypi.local
sudo systemctl status retrospicam.service
```

### Monitor logs
```bash
ssh pi@raspberrypi.local
journalctl -u retrospicam.service -f
```

### Test the API
```bash
# From your Mac or Pi
curl http://raspberrypi.local:8000/status
curl http://raspberrypi.local:8000/config
```

### Monitor Performance
```bash
ssh pi@raspberrypi.local
htop  # Watch CPU usage (should be lower now)
vcgencmd measure_temp  # Check temperature
```

---

## First Time Pi Setup

If this is the first deployment:

### 1. Create directory and venv on Pi
```bash
ssh pi@raspberrypi.local
mkdir -p ~/retrospicam
cd ~/retrospicam
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Deploy files (use any method above)

### 3. Install dependencies
```bash
ssh pi@raspberrypi.local
cd ~/retrospicam
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Create config
```bash
# Copy the optimized config
cat > ~/retrospicam/config.json << 'EOF'
{
  "camera_source": "usb",
  "usb_camera_device": "/dev/video2",
  "usb_camera_size": "640x480",
  "usb_camera_fps": 15,
  "usb_camera_format": "MJPG",
  "usb_audio_enabled": false
}
EOF
```

### 5. Start server manually (test)
```bash
cd ~/retrospicam
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 6. Set up systemd service (optional)
```bash
sudo nano /etc/systemd/system/retrospicam.service
```

Add:
```ini
[Unit]
Description=RetrosPiCam Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/retrospicam
ExecStart=/home/pi/retrospicam/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable retrospicam.service
sudo systemctl start retrospicam.service
sudo systemctl status retrospicam.service
```

---

## Update Just the Config

If you only want to update config.json:
```bash
scp pi-server/config.json pi@raspberrypi.local:~/retrospicam/
```

The server will reload it on next restart.

---

## Troubleshooting Deployment

### Connection refused
- Check Pi is powered on and connected to network
- Try using IP address instead of .local hostname
- Verify SSH is enabled: `sudo raspi-config` → Interface Options → SSH

### Permission denied
- Check SSH key is set up, or use password authentication
- Verify user has permissions: `ls -la ~/retrospicam`

### Files not updating
- Make sure you're syncing to correct path
- Check disk space on Pi: `df -h`
- Verify files ownership: `ls -la ~/retrospicam`

### Dependencies missing
```bash
ssh pi@raspberrypi.local
cd ~/retrospicam
source .venv/bin/activate
pip install -r requirements.txt --upgrade
```
