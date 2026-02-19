# Changelog

All notable changes to retrosPiCam are documented here.

---

## [Unreleased] - 2026-02-18

### Added
- **GitHub Actions CI** — runs `pytest` (Python 3.11) + `tsc --noEmit` (Node 20) on every push and PR to `main`
- **GitHub Actions CD** — manual-dispatch or version-tag triggered EAS build + TestFlight auto-submit
- **Pi server API test suite** — 39 pytest tests across all 5 router groups (`camera`, `motion`, `events`, `notifications`, `azure`); Pi hardware stubs allow tests to run in CI without a Raspberry Pi
- `pi-server/requirements-dev.txt` — CI-safe dependency set (excludes `picamera2`, `RPi.GPIO`, etc.)

### Changed
- **App icon redesign** — SVG source (`retrospicam_icon.svg`) updated with white glare highlights on raspberry; all PNG icon files regenerated from SVG with transparent background
- **Liquid Glass ready** — transparent icon background allows iOS 26 Liquid Glass material to render correctly through the icon
- Icon generation script (`generate_icons.py`) now renders directly from SVG via `cairosvg` instead of relying on a pre-baked PNG
- Updated: `retrospicam_icon_1024.png`, `App-Icon-1024x1024@1x.png` (iOS), and all sizes in `retrospicam_icons/`

### Fixed
- **Build number drift** — `eas.json` now sets `appVersionSource: "remote"` so EAS owns the build counter; `app.json` `buildNumber` bumped to `8` to stay ahead of last submitted build (`7`)

### Build
- `buildNumber` set to `8`; EAS remote counter takes precedence going forward

---

## [1.2.2] - 2026-02-18

### Fixed
- **Save to Photos / Share**: `FileSystem.makeDirectoryAsync` now called before `downloadAsync` to prevent "Directory does not exist" errors in TestFlight when saving or sharing media files nested in `recordings/`

### Build
- `CFBundleVersion` bumped to `7` for TestFlight submission

---

## [1.2.1] - 2026-02-17

### Build
- Fixed `CFBundleVersion` in `Info.plist` (was hardcoded to `"1"`, overriding `app.json`) — bumped to `6`
- Fixed `buildNumber` in `app.json` (was set to version string `"1.2.2"` instead of integer) — set to `5`

---

## [1.2.0] - 2026-02-17

### Changed — Frontend Refactor (PR #53)
- Extracted `App.tsx` (~1500 lines) into focused modules:
  - `src/components/ConnectionSetupModal.tsx`
  - `src/components/GalleryScreen.tsx`
  - `src/components/MainDashboard.tsx`
  - `src/components/MediaPreviewScreen.tsx`
  - `src/hooks/useAppInitialization.ts`
  - `src/hooks/useAppStateSync.ts`
  - `src/hooks/useSplashReady.ts`
  - `src/styles/appStyles.ts`
  - `src/utils/connection.ts`
  - `src/utils/media.ts`
  - `src/utils/pushNotifications.ts`
- Fixed client polling loop stability and prevented backend route blocking

### Changed — Backend Refactor (PR #52)
- Split monolithic `main.py` into modular routers and services:
  - `routers/camera.py`, `routers/motion.py`, `routers/events.py`, `routers/azure.py`, `routers/notifications.py`
  - `services/camera_service.py`, `services/motion_service.py`, `services/azure_service.py`, `services/notification_service.py`, `services/button_service.py`, `services/startup_service.py`, `services/backend_service.py`
  - `models/schemas.py`
  - `utils/helpers.py`

---

## [1.1.0] - 2026-01-xx

### Added
- Tailscale VPN support for remote access
- Hardware button support for manual recording trigger
- Motion sensitivity UI controls (threshold, min area, cooldown)
- Manual recording with MP4 conversion and push notification on ready
- Stream recovery controls (reload, stop/debounce)
- Motion debug/metrics endpoints
- Push token persistence on the Pi

---

## [1.0.0] - 2025-xx-xx

### Added
- MJPEG live stream from Raspberry Pi camera
- Still photo capture
- Motion detection with push notifications (Expo + APNs)
- App-controlled arm/disarm on foreground/background transitions
- Azure Blob Storage integration for media uploads
- Standalone Wi-Fi AP mode (Pi as hotspot)
- TestFlight / EAS build pipeline
- systemd service for auto-start on boot
