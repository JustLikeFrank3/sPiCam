#!/bin/bash
# Script to populate GitHub Project with sPiCam issues
# Requires: gh CLI (https://cli.github.com/)
# Usage: ./scripts/populate-github-project.sh

set -e

REPO="JustLikeFrank3/sPiCam"
PROJECT_NUMBER=1

echo "🚀 Populating sPiCam GitHub Project..."
echo "Repository: $REPO"
echo "Project: $PROJECT_NUMBER"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it: brew install gh"
    echo "Then authenticate: gh auth login"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub."
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Function to create issue and add to project
create_issue() {
    local title="$1"
    local body="$2"
    local labels="$3"
    
    echo "Creating: $title"
    
    # Create the issue
    issue_url=$(gh issue create \
        --repo "$REPO" \
        --title "$title" \
        --body "$body" \
        --label "$labels" \
        2>&1)
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Created: $issue_url"
        
        # Extract issue number from URL
        issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
        
        # Add to project (requires project ID, which is different from number)
        # gh project item-add $PROJECT_NUMBER --owner JustLikeFrank3 --url "$issue_url" 2>&1 || echo "  ⚠ Could not add to project (add manually)"
    else
        echo "  ✗ Failed: $issue_url"
    fi
    
    echo ""
}

echo "📝 Creating High Priority Issues (Ready)..."
echo "==========================================="
echo ""

# Mobile App Features
create_issue \
    "Play overlay metadata on video playback" \
    "## Description
Display useful metadata overlays during video playback:
- Timestamp of recording
- Motion detection trigger data
- Motion detection areas/zones highlighted
- FPS and resolution info

## Acceptance Criteria
- [ ] Timestamp displayed on video
- [ ] Motion data overlay (if available)
- [ ] Toggle to show/hide overlay
- [ ] Non-intrusive UI design

## Technical Notes
- Use React Native video player overlay
- Fetch metadata from /motion/metrics endpoint
- Store metadata with video files" \
    "feature,mobile-app,ui"

create_issue \
    "Improve preview loading error handling" \
    "## Description
Better error handling when loading images or videos fails.

## Current Issues
- Generic error messages
- No retry mechanism
- Unclear offline state

## Acceptance Criteria
- [ ] Descriptive error messages (network, not found, server error)
- [ ] Retry button with exponential backoff
- [ ] Offline state indicator
- [ ] Loading state UI improvements

## Technical Notes
- Use React Native NetInfo for offline detection
- Implement retry logic with max attempts
- Clear error UI/UX design" \
    "bug,mobile-app,ux"

create_issue \
    "Offline preview download and caching" \
    "## Description
Allow users to download and view captured media offline.

## Features
- Download images/videos to device
- Cache thumbnails automatically
- Sync status indicator
- Manage storage (delete old cached items)

## Acceptance Criteria
- [ ] Download button on media items
- [ ] Offline viewing capability
- [ ] Cache management UI
- [ ] Storage usage display

## Technical Notes
- Use React Native File System
- Implement background download queue
- SQLite for metadata storage?" \
    "feature,mobile-app,offline"

create_issue \
    "Animated splash screen" \
    "## Description
Replace static splash screen with animated version.

## Design
- sPiCam logo animation
- Smooth fade-in/out
- Brand-appropriate animation

## Acceptance Criteria
- [ ] Animated splash (Lottie or video)
- [ ] Smooth transition to main app
- [ ] Works on iOS (TestFlight)
- [ ] Reasonable file size (<500KB)

## Technical Notes
- Use Lottie for vector animation
- Or use video splash (iOS 14+)
- Update app.json splash configuration" \
    "enhancement,mobile-app,ui"

create_issue \
    "Improve connection error handling" \
    "## Description
More helpful error messages and diagnostics when connection fails.

## Current Issues
- Generic \"Cannot connect\" errors
- No guidance on local vs Tailscale

## Features
- Descriptive error messages
- Network diagnostic info (WiFi vs cellular, Tailscale status)
- Auto-retry with exponential backoff
- Quick action to open Tailscale app

## Acceptance Criteria
- [ ] Clear error messages per failure type
- [ ] Connection help modal with diagnostics
- [ ] Auto-retry mechanism
- [ ] Link to troubleshooting docs

## Technical Notes
- Detect Tailscale network (check IP range)
- Use NetInfo for network type
- Implement retry with backoff (2s, 4s, 8s, 16s, max)" \
    "enhancement,mobile-app,ux"

create_issue \
    "USB camera compatibility evaluation" \
    "## Description
Test and document compatible USB cameras with Pi Zero 2 W.

## Goals
- Identify best USB cameras for Pi Zero 2 W
- Document performance (FPS, resolution, CPU usage)
- Compare with Pi Camera Module 3

## Testing Checklist
- [ ] Logitech C920/C922
- [ ] Generic UVC cameras
- [ ] 720p vs 1080p performance
- [ ] MJPG vs YUYV format support
- [ ] CPU usage benchmarks

## Deliverables
- [ ] Updated HARDWARE.md with compatibility list
- [ ] Performance comparison table
- [ ] Recommended camera models

## Technical Notes
- Test with v4l-utils (v4l2-ctl --list-formats-ext)
- Monitor CPU with htop during streaming
- Document power requirements" \
    "research,hardware,pi-server"

create_issue \
    "Add motion detection zone configuration" \
    "## Description
Allow users to define specific areas to monitor for motion.

## Features
- Draw zones on camera preview
- Multiple zones with different sensitivities
- Ignore zones (e.g., trees swaying)
- Save zone configuration to server

## Acceptance Criteria
- [ ] UI to draw zones on preview
- [ ] Zone sensitivity per-zone
- [ ] Server-side zone validation
- [ ] Visual zone overlay on stream

## Technical Notes
- Store zones as polygon coordinates
- Server processes only pixels within zones
- Mobile app uses SVG/Canvas for zone drawing" \
    "feature,mobile-app,pi-server"

echo ""
echo "📦 Creating Backlog Issues..."
echo "=============================="
echo ""

# Security
create_issue \
    "Add authentication system" \
    "## Description
Implement user login and API authentication.

## Features
- User registration/login in mobile app
- JWT token-based authentication
- Secure token storage (iOS Keychain)
- API endpoint protection

## Acceptance Criteria
- [ ] Login screen in mobile app
- [ ] User management on Pi server
- [ ] All API endpoints require auth
- [ ] Token refresh mechanism

## Technical Notes
- Use FastAPI OAuth2 with JWT
- React Native Keychain for token storage
- bcrypt for password hashing" \
    "feature,security,mobile-app,pi-server"

create_issue \
    "HTTPS/TLS support for Pi server" \
    "## Description
Add SSL/TLS encryption for secure communication.

## Approach
- Self-signed certificates for local network
- Let's Encrypt for public access
- Tailscale already provides encryption

## Acceptance Criteria
- [ ] HTTPS enabled on Pi server
- [ ] Certificate generation script
- [ ] Mobile app trusts certificate
- [ ] Documentation for setup

## Technical Notes
- Use uvicorn --ssl-keyfile/ssl-certfile
- Or nginx reverse proxy
- Document that Tailscale already encrypts traffic" \
    "security,pi-server"

create_issue \
    "PIR sensor support for motion detection" \
    "## Description
Add hardware motion detection using PIR sensor.

## Benefits
- More power efficient than camera-based
- Instant detection (no frame processing)
- Fewer false positives

## Hardware
- HC-SR501 PIR sensor (~$2)
- GPIO connection to Pi

## Acceptance Criteria
- [ ] GPIO pin configuration
- [ ] PIR trigger sends notification
- [ ] Option to use PIR + camera confirmation
- [ ] Documentation and wiring diagram

## Technical Notes
- Use RPi.GPIO or gpiozero
- Trigger camera recording on PIR event
- Debounce PIR signal" \
    "feature,hardware,pi-server"

create_issue \
    "Continuous recording mode" \
    "## Description
24/7 recording with configurable retention.

## Features
- Continuous recording to disk
- Circular buffer (auto-delete old recordings)
- Configurable retention (hours/days/GB)
- Motion events tagged/bookmarked

## Acceptance Criteria
- [ ] Start/stop continuous recording
- [ ] Configure retention policy
- [ ] Storage usage monitoring
- [ ] Motion event markers in timeline

## Technical Notes
- Record in segments (5-10 min each)
- Use ffmpeg for efficient recording
- SQLite for segment metadata
- Raspberry Pi SD card wear concerns" \
    "feature,pi-server"

create_issue \
    "Multiple camera support" \
    "## Description
Connect mobile app to multiple Pi devices.

## Features
- Add/remove camera profiles
- Switch between cameras
- Saved credentials per camera
- View multiple streams (future: grid view)

## Acceptance Criteria
- [ ] Camera profile management UI
- [ ] Switch camera button
- [ ] Multiple saved servers
- [ ] Current camera indicator

## Technical Notes
- Store camera profiles in AsyncStorage
- API base URL per profile
- Handle different auth per camera" \
    "feature,mobile-app"

create_issue \
    "Schedule-based automatic arming" \
    "## Description
Automatically arm/disarm motion detection on schedule.

## Features
- Weekly schedule (e.g., arm 11pm-6am weekdays)
- Location-based arming (geofencing)
- Manual override always available

## Acceptance Criteria
- [ ] Schedule configuration UI
- [ ] Time-based auto arm/disarm
- [ ] Location-based (optional)
- [ ] Schedule stored on server

## Technical Notes
- Cron or APScheduler on Pi server
- iOS: Background location requires permissions
- Consider battery impact for geofencing" \
    "feature,mobile-app"

create_issue \
    "Rich push notifications with thumbnails" \
    "## Description
Include motion event thumbnail in push notification.

## Features
- JPG thumbnail in notification
- Quick actions (View, Arm, Disarm)
- Notification grouping

## Acceptance Criteria
- [ ] Thumbnail image in notification
- [ ] iOS notification actions
- [ ] Tap notification opens app to event
- [ ] Grouped notifications

## Technical Notes
- APNs supports images in notifications
- Upload thumbnail to temporary URL
- Include image URL in push payload
- iOS: UNNotificationAttachment" \
    "enhancement,mobile-app,notifications"

echo ""
echo "🐛 Creating Bug Issues..."
echo "========================="
echo ""

create_issue \
    "Stream recovery can fail silently" \
    "## Bug Description
Sometimes stream doesn't restart after /stream/stop.

## To Reproduce
1. Start stream
2. Call /stream/stop
3. Try to restart stream
4. Stream may not recover

## Expected Behavior
Stream should reliably restart after stop.

## Actual Behavior
Sometimes requires server restart or manual camera reset.

## Technical Details
- Investigate Picamera2.stop() vs close()
- Check camera release on /stream/stop
- Add error logging

## Priority
High - impacts user experience" \
    "bug,pi-server"

create_issue \
    "Memory usage grows over long-running server" \
    "## Bug Description
Pi server memory usage increases over time.

## Symptoms
- RSS memory grows after hours/days of uptime
- Eventually triggers OOM on Pi Zero 2 W

## Investigation Needed
- Use memory_profiler or tracemalloc
- Check for unreleased resources
- OpenCV memory leaks?

## Possible Causes
- Motion detection frames not released
- Stream generator not cleaning up
- Notification queue buildup

## Priority
Medium - affects long-term reliability" \
    "bug,pi-server,performance"

create_issue \
    "Stream doesn't auto-reconnect after app background" \
    "## Bug Description
When app returns from background, stream doesn't resume.

## To Reproduce
1. Start camera stream
2. Put app in background (home button)
3. Return to app
4. Stream is blank/frozen

## Expected Behavior
Stream should auto-reconnect when app foregrounds.

## Current Workaround
User must manually tap reload button.

## Technical Notes
- Use AppState listener in React Native
- Call checkConnection() on app foreground
- Reload stream automatically" \
    "bug,mobile-app"

create_issue \
    "Motion settings lack client-side validation" \
    "## Bug Description
Motion settings can be submitted with invalid values.

## Issues
- No min/max validation
- Can enter negative numbers
- No validation feedback

## Expected Behavior
- Validate before sending to server
- Show error for invalid values
- Prevent submission of bad data

## Validation Rules
- Threshold: 1-50
- Min Area: 5-1000
- Cooldown: 5-300

## Priority
Low - server validates, but UX issue" \
    "bug,mobile-app,ux"

echo ""
echo "📚 Creating Documentation Issues..."
echo "===================================="
echo ""

create_issue \
    "Generate OpenAPI/Swagger documentation" \
    "## Description
Auto-generate API documentation from FastAPI endpoints.

## Benefits
- Interactive API explorer
- Up-to-date documentation
- Easy testing of endpoints

## Deliverables
- [ ] Swagger UI available at /docs
- [ ] OpenAPI JSON schema
- [ ] Example requests/responses
- [ ] Authentication documentation

## Technical Notes
FastAPI has built-in Swagger support:
```python
app = FastAPI(
    title=\"sPiCam API\",
    description=\"Raspberry Pi camera controller\",
    version=\"0.1.0\"
)
```
Access at http://pi-ip:8000/docs" \
    "documentation,pi-server"

create_issue \
    "Create comprehensive hardware setup guide" \
    "## Description
Detailed guide for hardware setup and configuration.

## Contents
- Pi Camera Module 3 installation (ribbon cable)
- USB camera setup
- Recommended cameras list
- Tailscale installation walkthrough
- Network configuration (AP mode vs home network)
- Power supply recommendations
- Enclosure/mounting ideas

## Format
- Step-by-step with photos
- Troubleshooting section per step
- Video tutorial (optional)

## Deliverable
Create docs/HARDWARE_SETUP.md" \
    "documentation,hardware"

create_issue \
    "Add CONTRIBUTING.md guide" \
    "## Description
Help external contributors understand how to contribute.

## Contents
- Code of conduct
- Development environment setup
- Running tests
- Code style (PEP 8, ESLint)
- PR process
- Issue templates
- How to report bugs

## Deliverable
Create CONTRIBUTING.md in repo root" \
    "documentation,community"

create_issue \
    "Create architecture and data flow diagrams" \
    "## Description
Visual diagrams explaining system architecture.

## Diagrams Needed
1. High-level system architecture
2. Component interaction diagram
3. Data flow (camera → server → mobile)
4. Motion detection flow
5. Push notification flow

## Tools
- Mermaid diagrams (in markdown)
- Or draw.io / Excalidraw

## Deliverable
Add diagrams to docs/ARCHITECTURE.md" \
    "documentation"

echo ""
echo "✨ Creating Testing & Quality Issues..."
echo "========================================"
echo ""

create_issue \
    "Add unit tests for Pi server endpoints" \
    "## Description
Write tests for FastAPI endpoints and business logic.

## Coverage Targets
- [ ] All API endpoints
- [ ] Motion detection logic
- [ ] Notification system
- [ ] Configuration management

## Testing Framework
- pytest for Python
- FastAPI TestClient
- Mock Picamera2

## Deliverable
- tests/ directory with pytest tests
- CI integration (GitHub Actions)" \
    "testing,pi-server"

create_issue \
    "E2E tests for mobile app" \
    "## Description
End-to-end tests for critical user flows.

## Test Scenarios
1. Connect to Pi server
2. View live stream
3. Capture photo
4. Arm/disarm motion detection
5. View captured media
6. Configure motion settings

## Tools
- Detox (React Native)
- Or Appium

## Deliverable
- e2e/ directory with test suite
- Documentation on running tests" \
    "testing,mobile-app"

create_issue \
    "Set up CI/CD pipeline" \
    "## Description
Automate testing and builds with GitHub Actions.

## Workflows Needed
1. **Pi Server CI**
   - Lint (flake8, black)
   - Run unit tests
   - Check dependencies

2. **Mobile App CI**
   - Lint (ESLint, Prettier)
   - TypeScript compilation
   - Run unit tests

3. **Automated EAS Build**
   - Trigger on main branch merge
   - Build iOS/Android
   - Optional: Auto-submit to TestFlight

## Deliverable
- .github/workflows/ directory
- CI status badges in README" \
    "devops,ci-cd"

echo ""
echo "🎉 Done!"
echo ""
echo "Next steps:"
echo "1. Go to https://github.com/JustLikeFrank3/sPiCam/issues"
echo "2. Review created issues"
echo "3. Add them to your project: https://github.com/users/JustLikeFrank3/projects/1"
echo "   - On each issue, click 'Projects' → Select 'sPiCam'"
echo "4. Set issue statuses (Backlog, Ready, In Progress)"
echo ""
echo "To bulk add issues to project:"
echo "  gh project item-add 1 --owner JustLikeFrank3 --url <issue-url>"
