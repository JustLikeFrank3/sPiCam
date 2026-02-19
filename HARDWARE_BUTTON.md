# Physical Shutter Button Setup

This guide explains how to add a physical shutter button to your retrosPiCam for hands-free photo and video capture.

## Hardware Requirements

### Button Options
1. **Arcade Button** (~$3-5) - Large, satisfying click, easy to mount
2. **Tactile Momentary Button** (~$0.50) - Compact PCB-mount switch
3. **Camera Cable Release Adapter** (~$10-15) - Authentic camera feel
4. **Any Normally-Open (NO) Momentary Switch** - Will work!

### Additional Parts
- 2x jumper wires (female-to-female for breadboard testing, or solder directly)
- Optional: 10kΩ pull-up resistor (not required, Pi has internal pull-ups)

## Wiring

### Simple Wiring (Recommended)
```
[Button Pin 1] ──────> GPIO 17 (Physical Pin 11)
[Button Pin 2] ──────> GND (Physical Pin 9 or any GND)
```

### Raspberry Pi GPIO Pinout Reference
```
    3.3V  (1) (2)  5V
   GPIO2  (3) (4)  5V
   GPIO3  (5) (6)  GND
   GPIO4  (7) (8)  GPIO14
     GND  (9) (10) GPIO15
  GPIO17 (11) (12) GPIO18  <-- Default button pin (GPIO 17)
  GPIO27 (13) (14) GND
  GPIO22 (15) (16) GPIO23
    3.3V (17) (18) GPIO24
  GPIO10 (19) (20) GND
```

## Configuration

### 1. Enable Button in Config
Edit `pi-server/config.json`:
```json
{
  "shutter_button_enabled": true,
  "shutter_button_gpio": 17
}
```

Or set environment variables:
```bash
export SHUTTER_BUTTON_ENABLED=1
export SHUTTER_BUTTON_GPIO=17
```

### 2. Install Dependencies
The button feature requires `RPi.GPIO` which is included in `requirements.txt`:
```bash
cd ~/retrosPiCam/pi-server
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Restart the Service
```bash
sudo systemctl restart retrospicam
```

## Button Behavior

The button uses **press duration** to trigger different actions:

| Press Duration | Action |
|---|---|
| **< 0.5 seconds** | Capture single photo |
| **0.5 - 2 seconds** | Record 30-second video |
| **> 2 seconds** | Record 60-second video |

### Examples:
- **Quick tap** → Photo saved to `media/photo_<timestamp>.jpg`
- **Brief hold** (1 second) → 30s video recording starts
- **Long hold** (3 seconds) → 60s video recording starts

## Testing

### 1. Check Logs
```bash
# Watch server logs
sudo journalctl -u retrospicam -f
```

You should see:
```
[PiCam] Shutter button initialized on GPIO 17
[PiCam] Button handler thread started
```

### 2. Test Button Press
Press the button and watch for:
```
[PiCam] Button: short press (0.15s) - capturing photo
[PiCam] Photo captured: photo_1234567890.jpg
```

## Troubleshooting

### Button Not Responding
1. **Check wiring**: Use a multimeter to verify continuity when button is pressed
2. **Check GPIO permissions**: Ensure user has GPIO access (`sudo usermod -a -G gpio $USER`)
3. **Verify configuration**: `cat ~/retrosPiCam/pi-server/config.json | grep shutter`
4. **Check logs**: `sudo journalctl -u retrospicam -f`

### Wrong GPIO Pin
If GPIO 17 conflicts with your setup, change the pin:
1. Edit `config.json` → set `"shutter_button_gpio": 22` (or another available pin)
2. Restart service: `sudo systemctl restart retrospicam`

### GPIO Already in Use
If you see "GPIO already in use" errors:
```bash
# Check what's using GPIO
sudo gpio readall

# Clean up GPIO
echo "17" | sudo tee /sys/class/gpio/unexport
```

## Mounting Ideas

### Option 1: Drill Into Camera Body
- Mark button location on old camera body
- Drill hole matching button diameter
- Secure button with nut/mounting ring
- Route wires internally to Pi

### Option 2: External Button Box
- Mount button on small project box
- Attach box to tripod quick-release plate
- Keep wires external but tidy

### Option 3: Cable Release Style
- Use actual camera cable release adapter
- 3D print adapter bracket
- Attach to tripod mount or hot shoe

## Advanced: Multiple Buttons

You can add multiple buttons for different functions:

```json
{
  "shutter_button_gpio": 17,
  "record_30s_button_gpio": 22,
  "record_60s_button_gpio": 27
}
```

Modify the button handler in `main.py` to support multiple GPIO pins.

## Safety Notes

⚠️ **Do not connect 5V to GPIO pins!** All GPIO pins are 3.3V only. Connecting 5V will damage the Pi.

✅ **Safe connections**: 3.3V, GND, and GPIO pins
❌ **Unsafe**: Connecting 5V to GPIO inputs

## What Changes Were Made

This feature is in the `feature/physical-button-no-servo` branch:

### Code Changes:
- ✅ Button handler thread monitors GPIO pin for presses
- ✅ Press duration determines action (photo vs video)
- ✅ Internal `_capture_photo()` and `_start_recording()` functions
- ✅ Configuration via `config.json` or environment variables
- ✅ Removed servo/pan-tilt code (won't fit in camera housing)

### Hardware Requirements:
- ✅ RPi.GPIO library (already included in `requirements.txt`)
- ✅ Any momentary push button (normally-open)
- ✅ 2 wires to connect button to GPIO + GND

Enjoy your analog camera experience with digital capabilities! 📷
