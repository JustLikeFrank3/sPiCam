<p align="center">
   <img src="mobile-app/assets/spicam_icons/icon_512.png?raw=1" width="360" alt="sPiCam" />
</p>

# sPiCam

A Raspberry Pi camera project with a FastAPI server and an iOS mobile app.

## Structure
- `pi-server/` FastAPI server (stream + photo + events)
- `mobile-app/` Expo app for live view + capture

## Recent Features
- Push notifications for motion events
- App-controlled motion arm/disarm on foreground/background
- **Motion sensitivity UI controls** - adjust threshold, min area, and cooldown from mobile app
- Manual recording with MP4 conversion and "recording ready" notification
- Stream recovery controls (reload + server stop/debounce)
- Motion debug/metrics endpoints for tuning
- Push token persistence on the Pi
- **Tailscale VPN support** - remote access from anywhere

## Pi Server Setup (on Raspberry Pi)
1. Install OS + enable camera:
   - `sudo raspi-config` → Interface Options → Camera → Enable
2. Install dependencies:
   - `sudo apt update`
   - `sudo apt install -y python3-pip python3-picamera2`
3. Create venv and install:
   - `cd pi-server`
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
4. Run server:
   - `uvicorn main:app --host 0.0.0.0 --port 8000`

### Auto-start on Boot (systemd)
To run the server automatically on boot:

```bash
# Create service file
sudo tee /etc/systemd/system/spicam.service > /dev/null << 'EOF'
[Unit]
Description=sPiCam Server
After=network.target

[Service]
Type=simple
User=fvm3
WorkingDirectory=/home/fvm3/pi-server
ExecStart=/home/fvm3/pi-server/.venv/bin/python3 /home/fvm3/pi-server/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable spicam.service
sudo systemctl start spicam.service
sudo systemctl status spicam.service
```

Manage the service:
```bash
sudo systemctl status spicam.service   # Check status
sudo systemctl restart spicam.service  # Restart
journalctl -u spicam.service -f        # View logs
```

**Note:** Replace `fvm3` with your username and adjust paths if different.

## Azure Blob Storage (optional)
1. Create a storage account and container.
2. Copy `pi-server/.env.example` to `pi-server/.env` and set:
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `AZURE_STORAGE_CONTAINER=images`
3. Install dependencies on the Pi:
   - `pip install -r requirements.txt`
4. Restart the server. Snapshots and clips will upload to Blob Storage.

## Standalone (Pi as Wi-Fi AP)
Configure the Pi as an access point so your phone can connect directly.

1. Install AP tools:
   - `sudo apt install -y hostapd dnsmasq`
2. Configure hostapd (example):
   - SSID: `PiCam`
   - WPA2 password: `picam1234`
3. Configure dnsmasq for DHCP on `wlan0`.
4. Reboot and connect phone to `PiCam`.

### One-command setup (recommended)
From the Pi:
- `bash pi-server/ap/setup-ap.sh`

Config files:
- [pi-server/ap/hostapd.conf](pi-server/ap/hostapd.conf)
- [pi-server/ap/dnsmasq.conf](pi-server/ap/dnsmasq.conf)

When connected, use base URL: `http://192.168.4.1:8000`

## Mobile App Setup (local dev)
1. `cd mobile-app`
2. `npm install`
3. `npm run start`

## TestFlight Deployment
To deploy sPiCam to TestFlight for beta testing:
- See [TESTFLIGHT.md](TESTFLIGHT.md) for complete deployment guide
- Requires Apple Developer account ($99/year)
- Uses EAS (Expo Application Services) for building and submission
- Push notifications configured for production APNs

Quick start:
```bash
npm install -g eas-cli
eas login
cd mobile-app
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

## Remote Access (Tailscale)
Access your Pi from anywhere using Tailscale VPN:

**On the Pi:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

**On your phone:**
1. Install Tailscale from App Store
2. Sign in with same account
3. Connect to Tailscale network

**Update mobile app** (already configured):
- App uses Tailscale IP: `100.86.177.103:8000`
- Works on home WiFi, cellular, anywhere when Tailscale is connected

**Deploy to Pi:**
```bash
# Local network (default)
./deploy-to-pi.sh

# Or via Tailscale when remote
PI_HOST=100.86.177.103 ./deploy-to-pi.sh
```

## Push Notifications
1. Ensure `expo.extra.eas.projectId` is set in `mobile-app/app.json`.
2. Configure APNs credentials via EAS.
3. In the app, tap Enable Alerts to register the device with the Pi server.

## Endpoints
- `GET /stream` MJPEG stream
- `POST /stream/stop` close stream and release camera
- `POST /photo` capture still
- `GET /events` list captures
- `GET /recordings` list recordings
- `POST /record/start` start a manual recording
- `POST /arm` enable motion detection
- `POST /disarm` disable motion detection
- `GET /status` motion status
- `GET /notifications` motion notifications
- `POST /notifications/register` register push token
- `POST /notifications/unregister` unregister push token
- `POST /motion/test` send a test push notification
- `GET /motion/debug` motion debug status
- `GET /motion/metrics` motion detection metrics
- `GET /motion/settings` get motion sensitivity settings
- `POST /motion/settings` update motion sensitivity settings
- `GET /media/{filename}` serve photos and motion clips
- `GET /azure/blobs` list Azure blobs
- `GET /azure/media/{blob_name}` stream Azure blob

## Motion Clips
Motion clips are optional. Enable them with `MOTION_SAVE_CLIPS=1` in `pi-server/.env`.
When enabled, a short MJPG clip is saved as `motion_<timestamp>.avi`.
Use `/events` to list clips and `/media/{filename}` to download.

## Motion Tuning
**Adjust via Mobile App UI:**
The app includes a "Motion Settings" section to dynamically adjust:
- **Threshold** (1-50): Pixel difference sensitivity (default: 25)
- **Min Area** (5-1000): Minimum contour size to trigger detection (default: 500)
- **Cooldown** (5-300s): Seconds between notifications (default: 60)

Settings are persisted to `pi-server/.env` and take effect immediately.

**Manual Override** via `pi-server/.env`:
- `MOTION_THRESHOLD` (default 25)
- `MOTION_MIN_AREA` (default 500)
- `NOTIFICATION_COOLDOWN` (default 60)
- `MOTION_WARMUP_SEC` (default 3)
- `STREAM_STALE_SEC` (default 30)
- `STREAM_WARMUP_SEC` (default 10)
- `STREAM_DEBOUNCE_SEC` (default 5)

**Note for Pi Zero 2 W:** Lower values (threshold < 10, min_area < 100) can overwhelm the limited 512MB RAM, causing crashes. Use the Motion Settings UI to find optimal values for your environment.

## Security Mode (next)
- Motion detection (frame diff or PIR)
- Event recording + notifications
- Optional Azure Blob upload

## Work In Progress
- Play overlay metadata
- Preview loading error handling
- Offline preview download
- USB camera swap evaluation
- Animated splash screen

## License
MIT License - see [LICENSE](LICENSE) for details.
