# Changelog

All notable changes to sPiCam are documented here.

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
