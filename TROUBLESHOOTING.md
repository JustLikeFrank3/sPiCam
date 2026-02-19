# retrosPiCam Troubleshooting Guide

## USB Camera on Pi Zero 2 W

### Common Issues

#### 1. Slow/Laggy Stream
**Symptoms:** Video stream is choppy, low FPS, or freezes
**Cause:** Pi Zero 2 W has limited CPU (1GHz quad-core ARM Cortex-A53)
**Solution:**
- Lower resolution to 640x480 or 800x600
- Reduce FPS to 10-15
- Disable audio recording
- Disable motion detection or set `MOTION_AUTOSTART=0`

#### 2. Camera Opens/Closes Repeatedly
**Symptoms:** Stream works but camera keeps reconnecting
**Cause:** Old inefficient code was reopening camera for each frame
**Solution:** Updated code now keeps camera open persistently

#### 3. High CPU Usage
**Symptoms:** CPU at 100%, system slow, thermal throttling
**Solutions:**
- Use MJPG format (hardware-decoded by camera)
- Lower resolution and FPS
- Increase sleep times in motion detection
- Add heatsink to Pi Zero 2 W

#### 4. Out of Memory
**Symptoms:** Process killed, "Out of memory" errors
**Solutions:**
- Disable motion detection autostart
- Reduce `MEDIA_MAX_MB` limit
- Increase swap size: `sudo dphys-swapfile swapoff`, edit `/etc/dphys-swapfile`, `sudo dphys-swapfile setup`, `sudo dphys-swapfile swapon`

### Recommended Pi Zero 2 W Settings

```json
{
  "camera_source": "usb",
  "usb_camera_device": "/dev/video2",
  "usb_camera_size": "640x480",
  "usb_camera_fps": 15,
  "usb_camera_format": "MJPG",
  "usb_audio_enabled": false
}
```

Environment variables:
```bash
MOTION_AUTOSTART=0
MEDIA_MAX_MB=200
MOTION_SAVE_CLIPS=0
```

### Performance Testing

Test camera capabilities:
```bash
v4l2-ctl -d /dev/video2 --list-formats-ext
```

Check supported formats and resolutions. Look for:
- `MJPG` (hardware compressed - BEST for Pi Zero)
- `YUYV` (uncompressed - slower, avoid on Pi Zero)

Test FPS:
```bash
v4l2-ctl -d /dev/video2 --set-fmt-video=width=640,height=480,pixelformat=MJPG --stream-mmap --stream-count=100 --stream-to=/dev/null
```

Monitor CPU usage:
```bash
htop
```

Check temperature:
```bash
vcgencmd measure_temp
```

If over 70°C under load, add heatsink or improve ventilation.

### Camera Compatibility

**Best cameras for Pi Zero 2 W:**
- Cameras with MJPG hardware compression
- Resolution: 640x480 or 800x600
- FPS: 15-30
- USB 2.0 (matches Pi Zero USB speed)

**Problematic cameras:**
- 4K or 1080p60 cameras (too much data)
- YUYV-only cameras (no compression)
- USB 3.0 cameras (overkill, may have compatibility issues)
- Cameras requiring high power (Pi Zero provides limited USB power)

### Debug Commands

Check if camera is detected:
```bash
lsusb
ls -l /dev/video*
```

Test camera directly:
```bash
ffmpeg -f v4l2 -input_format mjpeg -video_size 640x480 -i /dev/video2 -frames:v 1 test.jpg
```

Check server logs:
```bash
journalctl -u retrospicam.service -f  # If running as service
# OR
tail -f /path/to/log
```

### Is Your Camera Too Complex?

**No** - if it supports MJPG format at reasonable resolution
**Yes** - if it only outputs uncompressed formats like YUYV at high resolution

The Pi Zero 2 W can handle:
- ✅ 640x480 MJPG @ 30fps
- ✅ 800x600 MJPG @ 20fps
- ⚠️ 1280x720 MJPG @ 15fps (borderline, may struggle with motion detection)
- ❌ 1920x1080 MJPG @ 30fps (too much for sustained streaming)
- ❌ Any YUYV uncompressed format above 640x480

### Key Improvements in This Version

1. **Persistent USB camera connection** - Camera stays open instead of reopening constantly
2. **Reduced resolution in motion detection** - Processes 320x240 instead of full res
3. **Lower JPEG quality** - 70% instead of 80% for streaming
4. **Optimized config** - Defaults to 640x480@15fps for Pi Zero
5. **CPU-friendly intervals** - Longer sleep times in motion loop
6. **Thread-safe camera access** - Lock prevents conflicts

These changes should make USB cameras work smoothly on Pi Zero 2 W.
