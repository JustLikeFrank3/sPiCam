# TestFlight Deployment Guide

This guide walks you through deploying sPiCam to TestFlight for beta testing.

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com
   - Enroll in the Apple Developer Program

2. **EAS CLI** (Expo Application Services)
   ```bash
   npm install -g eas-cli
   eas login
   ```

3. **App Store Connect Access**
   - Access to https://appstoreconnect.apple.com
   - Create app if it doesn't exist

## Step 1: Configure Apple Developer Settings

### Find Your Team ID
1. Go to https://developer.apple.com/account
2. Click "Membership" in sidebar
3. Copy your **Team ID** (10 characters)

### Create App in App Store Connect
1. Go to https://appstoreconnect.apple.com
2. Click **Apps** → **+** (Add App)
3. Fill in:
   - Name: `sPiCam`
   - Primary Language: English
   - Bundle ID: `com.justlikefrank3.spicam` (select from dropdown)
   - SKU: `spicam` (or any unique identifier)
4. Click **Create**
5. Copy the **App ID** (numeric, found in App Information)

### Update eas.json
Edit `mobile-app/eas.json` and replace placeholder values:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-apple-id@icloud.com",    // Your Apple ID email
      "ascAppId": "1234567890",                  // App Store Connect App ID
      "appleTeamId": "ABC123DEFG"                // Your Team ID
    }
  }
}
```

## Step 2: Configure Push Notifications

### Generate APNs Key
1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click **+** (Add Key)
3. Name: `sPiCam Push Notifications`
4. Enable **Apple Push Notifications service (APNs)**
5. Click **Continue** → **Register** → **Download**
6. Save the `.p8` file securely
7. Note the **Key ID** (10 characters)

### Upload to Expo
```bash
cd mobile-app
eas credentials
```

Select:
- **iOS** → **production** → **Push Notifications**
- **Upload a new key**
- Provide the `.p8` file path
- Enter Key ID and Team ID

## Step 3: Build for TestFlight

### Build the App
```bash
cd mobile-app
eas build --platform ios --profile production
```

This will:
- Build the app on Expo's servers
- Sign it with your Apple Developer credentials
- Generate an `.ipa` file for App Store submission
- Take ~15-20 minutes

### Monitor Build
- Watch the terminal output for progress
- Or check https://expo.dev/accounts/justlikefrank3/projects/spicam/builds

## Step 4: Submit to TestFlight

### Option A: Automatic Submission (Recommended)
```bash
eas submit --platform ios --profile production
```

This will:
- Upload the `.ipa` to App Store Connect
- Submit for TestFlight review
- Take ~5-10 minutes

### Option B: Manual Submission
1. Download the `.ipa` from the EAS build page
2. Go to https://appstoreconnect.apple.com
3. Select your app → **TestFlight** tab
4. Click **+** under builds
5. Upload the `.ipa` file

## Step 5: Wait for Apple Review

- **Processing**: 5-15 minutes after upload
- **Waiting for Review**: Can take 24-48 hours
- **In Review**: Usually 1-3 hours
- **Ready to Test**: You'll receive an email

## Step 6: Add Beta Testers

Once approved:

1. Go to **TestFlight** tab in App Store Connect
2. Under **Internal Testing** or **External Testing**:
   - Click **+** next to Testers
   - Add email addresses
   - Click **Add**

Testers will receive an email with:
- Link to download TestFlight app
- Invite code to install sPiCam

## Step 7: Install on iPhone

**For testers:**
1. Install TestFlight from App Store
2. Tap the invite link in email
3. Accept the invite
4. Tap **Install**

**First launch:**
- App will use Tailscale IP: `100.86.177.103:8000`
- Make sure Tailscale is connected on iPhone
- Grant notification permissions when prompted

## Updating the Build

When you make changes:

```bash
# Update version in app.json
# "version": "0.1.1"  (or "0.2.0" for bigger changes)

cd mobile-app
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

TestFlight testers will automatically receive update notifications.

## Troubleshooting

### Build fails with "Invalid Bundle Identifier"
- Ensure bundle ID matches App Store Connect: `com.justlikefrank3.spicam`
- Check `mobile-app/app.json` → `ios.bundleIdentifier`

### "Missing Push Notification Entitlement"
- Upload APNs key via `eas credentials`
- Ensure `aps-environment` is set to `production` in `app.json`

### "App Not Eligible for TestFlight"
- App must pass automated review
- Check for missing privacy descriptions in `app.json`
- All required: Camera, Photos, Notifications, Local Network

### Push Notifications Not Working
- Ensure APNs key is uploaded to Expo (`eas credentials`)
- Check `aps-environment: production` in `app.json`
- Verify push tokens are registered (tap "Enable Alerts" in app)

### Can't Connect to Pi
- Ensure Tailscale is running on iPhone and Pi
- Check Pi is online: ping `100.86.177.103`
- Or temporarily test on local WiFi with `192.168.68.71`

## Testing Checklist

Before submitting to TestFlight:

- [ ] App builds without errors
- [ ] Camera stream works on WiFi
- [ ] Camera stream works via Tailscale
- [ ] Push notifications work when app is backgrounded
- [ ] Motion detection triggers notifications
- [ ] Photo capture and save to library works
- [ ] Video recording works
- [ ] Motion settings UI adjusts values properly
- [ ] Pan/Tilt controls work (if servo enabled)

## What TestFlight Does NOT Solve

**Network Access:**
- TestFlight only distributes the app to testers
- **You still need Tailscale** (or VPN/port forwarding) for remote access
- The app won't magically connect to your Pi without network setup
- Tailscale IP (`100.86.177.103`) must be reachable from tester's device

**For cellular access:** Testers must install Tailscale on their iPhone and join your network, OR you need to set up a public endpoint (not recommended for security).

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
