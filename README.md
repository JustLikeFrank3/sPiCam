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
- Manual recording with MP4 conversion and "recording ready" notification
- Stream recovery controls (reload + server stop/debounce)
- Motion debug/metrics endpoints for tuning
- Push token persistence on the Pi

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
- `GET /media/{filename}` serve photos and motion clips
- `GET /azure/blobs` list Azure blobs
- `GET /azure/media/{blob_name}` stream Azure blob

## Motion Clips
Motion clips are optional. Enable them with `MOTION_SAVE_CLIPS=1` in `pi-server/.env`.
When enabled, a short MJPG clip is saved as `motion_<timestamp>.avi`.
Use `/events` to list clips and `/media/{filename}` to download.

## Motion Tuning
You can override defaults via `pi-server/.env`:
- `MOTION_THRESHOLD` (default 6)
- `MOTION_MIN_AREA` (default 20)
- `MOTION_WARMUP_SEC` (default 3)
- `STREAM_STALE_SEC` (default 30)
- `STREAM_WARMUP_SEC` (default 10)
- `STREAM_DEBOUNCE_SEC` (default 5)

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
