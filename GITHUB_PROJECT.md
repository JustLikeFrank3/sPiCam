# RetrosPiCam GitHub Project Board

This document outlines tasks and issues to populate your GitHub Project board.

## 📋 How to Use
1. Go to your GitHub repo → Projects → New Project
2. Choose "Board" template
3. Create these columns: `📥 Backlog`, `🎯 Ready`, `🚧 In Progress`, `✅ Done`
4. Add issues from the sections below

---

## ✅ Recently Completed (Done)
These can be closed or moved to archive:

### Infrastructure & Deployment
- [x] **Configure systemd auto-start service**
  - Created `/etc/systemd/system/retrospicam.service`
  - Server now starts automatically on Pi boot
  - Updated README with setup instructions

- [x] **TestFlight deployment setup**
  - Created EAS build configuration
  - Generated App Store Connect API Key
  - Configured production APNs
  - Submitted first build to TestFlight
  - Documentation: TESTFLIGHT.md

- [x] **Add Tailscale VPN support**
  - Enables remote access from anywhere
  - Mobile app configured for Tailscale IP (100.86.177.103)
  - Updated deploy script for local/Tailscale flexibility
  - Documentation in README

- [x] **Connection check modal for TestFlight users**
  - Explains Tailscale requirement
  - Setup instructions with download link
  - Custom IP input for testing

### Motion Detection
- [x] **Fix motion detection overwhelming Pi Zero 2 W**
  - Changed defaults: threshold 4→25, min_area 10→500
  - Prevents OOM crashes from excessive contour processing
  - Added warnings in documentation

- [x] **Motion settings UI**
  - Dynamic threshold/min_area/cooldown adjustment from mobile app
  - Settings persisted to .env file
  - Real-time updates without restart

- [x] **Motion debug endpoints**
  - `/motion/debug` for status inspection
  - `/motion/metrics` for performance monitoring
  - Helped identify and fix memory issues

---

## 🚧 In Progress

### TestFlight & Distribution
- [ ] **Monitor TestFlight submission**
  - Status: Waiting for EAS outage to resolve
  - Submission ID: 2b453ba6-47f9-4137-9200-06cfd3d2e3c9
  - Track: https://expo.dev/accounts/justlikefrank3/projects/retrospicam/submissions/2b453ba6-47f9-4137-9200-06cfd3d2e3c9
  - Next: Wait for Apple review (24-48h)

- [ ] **Add TestFlight beta testers**
  - Blocked by: Apple review approval
  - Go to App Store Connect → TestFlight → Add testers by email
  - Test on real devices with Tailscale

---

## 🎯 Ready (High Priority)

### Mobile App Features
- [ ] **Play overlay metadata**
  - Display timestamp, motion data on video playback
  - Show motion detection trigger areas
  - Labels: `feature`, `mobile-app`, `ui`

- [ ] **Preview loading error handling**
  - Better error messages for failed image/video loads
  - Retry mechanism
  - Offline state indication
  - Labels: `bug`, `mobile-app`, `ux`

- [ ] **Offline preview download**
  - Cache images/videos locally on device
  - View captured media without connection
  - Sync status indicator
  - Labels: `feature`, `mobile-app`, `offline`

### UI/UX Improvements
- [ ] **Animated splash screen**
  - Replace static splash with animated version
  - RetrosPiCam logo animation
  - Labels: `enhancement`, `mobile-app`, `ui`

- [ ] **Improve connection error handling**
  - More descriptive error messages
  - Network diagnostics info (local vs Tailscale)
  - Auto-retry with exponential backoff
  - Labels: `enhancement`, `mobile-app`, `ux`

### Hardware
- [ ] **USB camera swap evaluation**
  - Test different USB cameras with Pi Zero 2 W
  - Document compatible models
  - Performance comparison
  - Labels: `research`, `hardware`, `pi-server`

---

## 📥 Backlog (Medium Priority)

### Security & Privacy
- [ ] **Authentication system**
  - Add user login to mobile app
  - Secure API endpoints with tokens
  - Multi-user support
  - Labels: `feature`, `security`, `mobile-app`, `pi-server`

- [ ] **HTTPS/TLS support**
  - SSL certificates for Pi server
  - Secure communication over Tailscale
  - Labels: `security`, `pi-server`

### Cloud Integration
- [ ] **Improve Azure Blob Storage integration**
  - Automatic upload resume on connection failure
  - Thumbnail generation in cloud
  - Cost optimization (lifecycle policies)
  - Labels: `enhancement`, `cloud`, `pi-server`

- [ ] **S3 storage option**
  - Alternative to Azure for users preferring AWS
  - Configuration via environment variables
  - Labels: `feature`, `cloud`, `pi-server`

### Motion Detection
- [ ] **PIR sensor support**
  - Hardware motion detection option
  - More power efficient than camera-based
  - Fewer false positives
  - Labels: `feature`, `hardware`, `pi-server`

- [ ] **AI-powered motion detection**
  - Person/animal detection vs general motion
  - Reduce false positives from wind, shadows
  - TensorFlow Lite on Pi?
  - Labels: `feature`, `ai`, `pi-server`, `research`

- [ ] **Motion detection zones**
  - Define specific areas to monitor
  - Ignore activity in certain regions
  - UI for zone configuration
  - Labels: `feature`, `mobile-app`, `pi-server`

### Recording & Playback
- [ ] **Continuous recording mode**
  - 24/7 recording with configurable retention
  - Circular buffer for storage management
  - Labels: `feature`, `pi-server`

- [ ] **Time-lapse mode**
  - Configurable interval photo capture
  - Auto-generate time-lapse video
  - Labels: `feature`, `pi-server`, `mobile-app`

- [ ] **Video playback controls**
  - Scrubbing timeline
  - Playback speed adjustment
  - Frame-by-frame navigation
  - Labels: `feature`, `mobile-app`, `ui`

### Mobile App
- [ ] **Multiple camera support**
  - Connect to multiple Pi devices
  - Switch between cameras in app
  - Saved camera profiles
  - Labels: `feature`, `mobile-app`

- [ ] **Schedule-based arming**
  - Auto-arm/disarm on schedule
  - Location-based arming (geofencing)
  - Labels: `feature`, `mobile-app`

- [ ] **Rich push notifications**
  - Thumbnail images in notifications
  - Quick actions (arm/disarm from notification)
  - Labels: `enhancement`, `mobile-app`, `notifications`

### Admin & Configuration
- [ ] **Web admin interface**
  - Browser-based configuration
  - System status dashboard
  - Log viewer
  - Labels: `feature`, `pi-server`, `ui`

- [ ] **OTA firmware updates**
  - Update Pi server code from mobile app
  - Rollback capability
  - Labels: `feature`, `pi-server`, `mobile-app`

---

## 🐛 Known Issues (Bugs)

### Pi Server
- [ ] **Stream recovery can fail silently**
  - Sometimes stream doesn't restart after stop
  - Need better error reporting
  - Labels: `bug`, `pi-server`

- [ ] **Memory usage grows over time**
  - Possible memory leak in long-running server
  - Investigate with profiling tools
  - Labels: `bug`, `pi-server`, `performance`

### Mobile App
- [ ] **Stream doesn't auto-reconnect after app background**
  - User must manually reload stream
  - Should auto-resume on app foreground
  - Labels: `bug`, `mobile-app`

- [ ] **Motion settings validation**
  - No client-side validation before sending to server
  - Can enter invalid values
  - Labels: `bug`, `mobile-app`, `ux`

---

## 📚 Documentation

- [ ] **API documentation**
  - OpenAPI/Swagger docs for all endpoints
  - Example requests/responses
  - Labels: `documentation`, `pi-server`

- [ ] **Hardware setup guide**
  - Detailed Pi camera module installation
  - USB camera compatibility list
  - Tailscale setup walkthrough
  - Labels: `documentation`, `hardware`

- [ ] **Contributing guide**
  - CONTRIBUTING.md with guidelines
  - Development environment setup
  - Testing procedures
  - Labels: `documentation`, `community`

- [ ] **Architecture diagram**
  - System architecture overview
  - Component interaction diagram
  - Data flow diagrams
  - Labels: `documentation`

---

## 🧪 Testing & Quality

- [ ] **Unit tests for Pi server**
  - FastAPI endpoint tests
  - Motion detection logic tests
  - Labels: `testing`, `pi-server`

- [ ] **E2E tests for mobile app**
  - Detox or Appium setup
  - Critical user flow tests
  - Labels: `testing`, `mobile-app`

- [ ] **Load testing**
  - Multiple concurrent streams
  - High-frequency motion events
  - Labels: `testing`, `performance`, `pi-server`

- [ ] **CI/CD pipeline**
  - GitHub Actions for automated testing
  - Automated EAS builds on merge to main
  - Labels: `devops`, `ci-cd`

---

## 🔮 Future Ideas (Low Priority)

- [ ] **Android app**
  - Build Android version using same React Native codebase
  - Google Play Store deployment
  - Labels: `feature`, `mobile-app`, `android`

- [ ] **Apple Watch companion app**
  - Quick view of camera stream
  - Arm/disarm controls
  - Labels: `feature`, `mobile-app`, `watchos`

- [ ] **HomeKit integration**
  - Expose as HomeKit camera
  - Integration with Home app
  - Labels: `feature`, `integration`, `homekit`

- [ ] **MQTT support**
  - Publish events to MQTT broker
  - Smart home integration (Home Assistant)
  - Labels: `feature`, `integration`, `iot`

- [ ] **Battery power support**
  - Low-power mode optimizations
  - Battery monitoring
  - Wake-on-motion
  - Labels: `feature`, `hardware`, `power`

---

## 📊 Project Statistics

**Total Tasks:** 40+
**Completed:** 9
**In Progress:** 2
**Ready:** 7
**Backlog:** 22+
**Bugs:** 4
**Documentation:** 4

---

## 🏷️ Suggested GitHub Labels

Create these labels in your repo:

### Type
- `feature` - New functionality
- `bug` - Something isn't working
- `enhancement` - Improvement to existing feature
- `documentation` - Documentation updates
- `research` - Investigation/exploration needed

### Component
- `pi-server` - Python FastAPI server
- `mobile-app` - React Native mobile app
- `hardware` - Raspberry Pi or camera hardware
- `cloud` - Azure/AWS integration
- `notifications` - Push notification system

### Platform
- `ios` - iOS specific
- `android` - Android specific
- `watchos` - Apple Watch

### Priority
- `priority: critical` - Blocking issue
- `priority: high` - Important
- `priority: medium` - Standard
- `priority: low` - Nice to have

### Status
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `blocked` - Cannot proceed

### Quality
- `testing` - Test coverage
- `security` - Security related
- `performance` - Performance optimization
- `ux` - User experience
- `ui` - User interface

---

## 🎯 Recommended Sprints

### Sprint 1: TestFlight Launch (Current)
- Complete TestFlight submission
- Monitor Apple review
- Add initial beta testers
- Fix critical bugs discovered in testing

### Sprint 2: Mobile App Polish
- Preview error handling
- Offline download
- Animated splash
- Connection improvements

### Sprint 3: Hardware & Performance
- USB camera evaluation
- Memory leak investigation
- Performance optimization

### Sprint 4: Security & Multi-user
- Authentication system
- HTTPS/TLS
- User management

---

**Last Updated:** February 13, 2026
**Maintainer:** Frank MacBride (@fvm3)
