from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pathlib import Path
import io
import time
import threading
from typing import Optional
import json
import os
from dotenv import load_dotenv
from datetime import datetime
import subprocess
import shutil
from pydantic import BaseModel

try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder, H264Encoder
    from picamera2.outputs import FileOutput
    PICAMERA_AVAILABLE = True
except Exception:
    PICAMERA_AVAILABLE = False

from PIL import Image, ImageDraw
import cv2
import numpy as np
from azure.storage.blob import BlobServiceClient, ContentSettings

app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
MEDIA_DIR = BASE_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)

picam = None
motion_enabled = True
last_motion_ts: Optional[float] = None
last_notification_time: Optional[float] = None
NOTIFICATION_COOLDOWN = int(os.getenv("NOTIFICATION_COOLDOWN", "60"))
motion_lock = threading.Lock()
background_frame: Optional[np.ndarray] = None
motion_thread: Optional[threading.Thread] = None
recording_clip = False
stream_active = False
stream_stop_requested = False
last_stream_start_ts = 0.0
motion_enabled_since: Optional[float] = None
latest_stream_frame: Optional[np.ndarray] = None
latest_stream_frame_ts = 0.0
latest_stream_lock = threading.Lock()
motion_metrics = {
    "last_delta_mean": None,
    "last_delta_max": None,
    "last_contour_area": None,
    "last_contour_count": None,
    "last_frame_ts": None,
}

AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "images")
blob_service: Optional[BlobServiceClient] = None
container_client = None

if AZURE_CONNECTION_STRING:
    blob_service = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)
    container_client = blob_service.get_container_client(AZURE_CONTAINER)
else:
    print("[PiCam] Azure upload disabled: AZURE_STORAGE_CONNECTION_STRING not set")

MOTION_THRESHOLD = int(os.getenv("MOTION_THRESHOLD", "25"))
MOTION_MIN_AREA = int(os.getenv("MOTION_MIN_AREA", "500"))
MOTION_COOLDOWN_SEC = 3
MOTION_WARMUP_SEC = float(os.getenv("MOTION_WARMUP_SEC", "3"))
CLIP_SECONDS = 3
CLIP_FPS = 8
MOTION_SAVE_CLIPS = os.getenv("MOTION_SAVE_CLIPS", "0") == "1"
STREAM_STALE_SEC = float(os.getenv("STREAM_STALE_SEC", "30"))
STREAM_DEBOUNCE_SEC = float(os.getenv("STREAM_DEBOUNCE_SEC", "5"))
STREAM_WARMUP_SEC = float(os.getenv("STREAM_WARMUP_SEC", "10"))

RTC_ENABLED = os.getenv("RTC_ENABLED", "0") == "1"
SHUTTER_BUTTON_ENABLED = os.getenv("SHUTTER_BUTTON_ENABLED", "1") == "1"
SHUTTER_BUTTON_GPIO = int(os.getenv("SHUTTER_BUTTON_GPIO", "17"))
rtc_device = None
rtc_error: Optional[str] = None
motion_notifications = []
MOTION_NOTIFICATIONS_MAX = 50
push_tokens = set()
recording_state = {"is_recording": False, "duration": 0, "start_time": None}
PUSH_TOKENS_FILE = BASE_DIR / "push_tokens.json"
button_gpio_initialized = False


class RecordRequest(BaseModel):
    duration: int = 30

class PushTokenRequest(BaseModel):
    token: str


def _placeholder_frame() -> bytes:
    img = Image.new("RGB", (640, 480), color=(20, 20, 20))
    draw = ImageDraw.Draw(img)
    text = "Pi Camera Placeholder"
    draw.text((20, 20), text, fill=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def _update_latest_stream_frame(frame_bytes: bytes) -> None:
    global latest_stream_frame, latest_stream_frame_ts
    now = time.time()
    if now - latest_stream_frame_ts < 0.2:
        return
    img = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return
    with latest_stream_lock:
        latest_stream_frame = img
        latest_stream_frame_ts = now


def _get_frame_array() -> Optional[np.ndarray]:
    if stream_active:
        with latest_stream_lock:
            if latest_stream_frame is not None:
                if time.time() - latest_stream_frame_ts <= 1.0:
                    return latest_stream_frame.copy()
    if PICAMERA_AVAILABLE:
        _init_camera()
        if picam is not None:
            try:
                frame = picam.capture_array()
                return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            except Exception as e:
                print(f"Frame capture error: {e}")
                return None
    placeholder = _placeholder_frame()
    img = cv2.imdecode(np.frombuffer(placeholder, np.uint8), cv2.IMREAD_COLOR)
    return img


def _clamp(value: float, minimum: int, maximum: int) -> float:
    return max(minimum, min(maximum, value))


def _init_button_gpio():
    """Initialize GPIO for physical shutter button"""
    global button_gpio_initialized
    if button_gpio_initialized or not SHUTTER_BUTTON_ENABLED:
        return
    try:
        import RPi.GPIO as GPIO
        # Clean up any previous GPIO state
        GPIO.setwarnings(False)
        try:
            GPIO.cleanup(SHUTTER_BUTTON_GPIO)
        except:
            pass
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(SHUTTER_BUTTON_GPIO, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        button_gpio_initialized = True
        print(f"[PiCam] Shutter button initialized on GPIO {SHUTTER_BUTTON_GPIO}")
    except Exception as exc:
        print(f"[PiCam] Button GPIO init failed: {exc}")


def _button_handler():
    """Monitor physical button presses and trigger photo/video capture"""
    if not SHUTTER_BUTTON_ENABLED:
        return
    
    _init_button_gpio()
    if not button_gpio_initialized:
        return
    
    import RPi.GPIO as GPIO
    
    print("[PiCam] Button handler thread started (polling mode)")
    last_state = GPIO.HIGH
    
    while True:
        try:
            current_state = GPIO.input(SHUTTER_BUTTON_GPIO)
            
            # Detect button press (HIGH -> LOW transition)
            if last_state == GPIO.HIGH and current_state == GPIO.LOW:
                print(f"[PiCam] Button press detected on GPIO {SHUTTER_BUTTON_GPIO}")
                press_start = time.time()
                
                # Wait for button release
                while GPIO.input(SHUTTER_BUTTON_GPIO) == GPIO.LOW:
                    time.sleep(0.05)
                
                press_duration = time.time() - press_start
                print(f"[PiCam] Button released after {press_duration:.2f}s")
                
                if press_duration < 0.5:
                    # Short press: capture photo
                    print(f"[PiCam] Button: short press ({press_duration:.2f}s) - capturing photo")
                    _capture_photo()
                elif press_duration < 2.0:
                    # Medium hold: record 30s video
                    print(f"[PiCam] Button: medium hold ({press_duration:.2f}s) - recording 30s")
                    _start_recording(30)
                else:
                    # Long hold: record 60s video
                    print(f"[PiCam] Button: long hold ({press_duration:.2f}s) - recording 60s")
                    _start_recording(60)
                
                # Debounce
                time.sleep(0.3)
            
            last_state = current_state
            time.sleep(0.01)  # Poll every 10ms
            
        except Exception as exc:
            import traceback
            print(f"[PiCam] Button handler error: {type(exc).__name__}: {exc}")
            print(f"[PiCam] Traceback: {traceback.format_exc()}")
            time.sleep(1)


def _capture_photo():
    """Internal function to capture a photo (called by button handler)"""
    timestamp = int(time.time())
    output_path = MEDIA_DIR / f"photo_{timestamp}.jpg"

    if PICAMERA_AVAILABLE:
        _init_camera()
        if picam is not None:
            picam.capture_file(str(output_path))
            print(f"[PiCam] Photo captured: {output_path.name}")
        else:
            print("[PiCam] Camera not available, using placeholder")
            output_path.write_bytes(_placeholder_frame())
    else:
        output_path.write_bytes(_placeholder_frame())
    
    _upload_blob(output_path)
    _add_notification(f"Photo captured: {output_path.name}", "photo")


def _start_recording(duration: int):
    """Internal function to start video recording (called by button handler)"""
    global recording_state
    
    if recording_state["is_recording"]:
        print("[PiCam] Recording already in progress, ignoring button press")
        return
    
    if not PICAMERA_AVAILABLE:
        print("[PiCam] Camera not available for recording")
        return
    
    duration = max(5, min(120, duration))  # Clamp between 5-120 seconds
    recording_state = {
        "is_recording": True,
        "duration": duration,
        "start_time": time.time()
    }
    
    # Start recording in background thread
    threading.Thread(target=_record_video, args=(duration,), daemon=True).start()
    print(f"[PiCam] Recording started: {duration}s")


def _get_rtc():
    global rtc_device, rtc_error
    if rtc_device is not None or rtc_error is not None or not RTC_ENABLED:
        return rtc_device
    try:
        import board
        import busio
        import adafruit_ds3231

        i2c = busio.I2C(board.SCL, board.SDA)
        rtc_device = adafruit_ds3231.DS3231(i2c)
        return rtc_device
    except Exception as exc:
        rtc_error = str(exc)
        print(f"[PiCam] RTC init failed: {exc}")
        return None


def _save_motion_snapshot(frame: np.ndarray):
    global last_motion_ts
    now = time.time()
    with motion_lock:
        if last_motion_ts and (now - last_motion_ts) < MOTION_COOLDOWN_SEC:
            return
        last_motion_ts = now
    ts = int(now)
    output_path = MEDIA_DIR / f"motion_{ts}.jpg"
    cv2.imwrite(str(output_path), frame)
    _add_notification("Motion detected - snapshot saved", "motion")
    _upload_blob(output_path)


def _save_motion_clip():
    global recording_clip
    if recording_clip:
        return
    recording_clip = True
    try:
        ts = int(time.time())
        output_path = MEDIA_DIR / f"motion_{ts}.avi"
        frame = _get_frame_array()
        if frame is None:
            return
        height, width = frame.shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        writer = cv2.VideoWriter(str(output_path), fourcc, CLIP_FPS, (width, height))
        start = time.time()
        while time.time() - start < CLIP_SECONDS:
            frame = _get_frame_array()
            if frame is not None:
                writer.write(frame)
            time.sleep(1.0 / CLIP_FPS)
        writer.release()
        _upload_blob(output_path)
    finally:
        recording_clip = False


def _add_notification(message: str, kind: str = "info"):
    motion_notifications.append(
        {
            "message": message,
            "kind": kind,
            "timestamp": datetime.now().isoformat(),
        }
    )
    if len(motion_notifications) > MOTION_NOTIFICATIONS_MAX:
        del motion_notifications[:-MOTION_NOTIFICATIONS_MAX]


def _upload_blob(path: Path):
    if container_client is None:
        print(f"[PiCam] Azure upload skipped for {path.name}")
        return
    try:
        content_type = "application/octet-stream"
        if path.suffix.lower() in [".jpg", ".jpeg"]:
            content_type = "image/jpeg"
        elif path.suffix.lower() == ".avi":
            content_type = "video/x-msvideo"
        with open(path, "rb") as handle:
            container_client.upload_blob(
                name=path.name,
                data=handle,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )
        print(f"[PiCam] Azure upload ok: {path.name}")
    except Exception as exc:
        print(f"[PiCam] Azure upload failed for {path.name}: {exc}")


def _load_push_tokens() -> None:
    global push_tokens
    if not PUSH_TOKENS_FILE.exists():
        return
    try:
        data = json.loads(PUSH_TOKENS_FILE.read_text())
        if isinstance(data, list):
            push_tokens = set(str(token) for token in data)
    except Exception as exc:
        print(f"[PiCam] Failed to load push tokens: {exc}")


def _save_push_tokens() -> None:
    try:
        PUSH_TOKENS_FILE.write_text(json.dumps(sorted(push_tokens)))
    except Exception as exc:
        print(f"[PiCam] Failed to save push tokens: {exc}")


def _list_recordings() -> list[Path]:
    mp4_files = sorted(MEDIA_DIR.glob("recording_*.mp4"), reverse=True)
    mp4_stems = {path.stem for path in mp4_files}
    h264_files = sorted(MEDIA_DIR.glob("recording_*.h264"), reverse=True)
    h264_filtered = [path for path in h264_files if path.stem not in mp4_stems]
    return mp4_files + h264_filtered


def _close_camera():
    global picam
    if picam:
        try:
            picam.stop_recording()
        except:
            pass
        try:
            picam.stop()
        except:
            pass
        try:
            picam.close()
        except:
            pass
    picam = None


def _init_camera():
    global picam
    if not PICAMERA_AVAILABLE:
        return
    if picam is None:
        try:
            picam = Picamera2()
            config = picam.create_video_configuration(main={"size": (640, 480)})
            picam.configure(config)
            picam.start()
        except Exception as e:
            print(f"Camera initialization error: {e}")
            if picam:
                try:
                    picam.close()
                except:
                    pass
            picam = None
            # Camera might be in use, will retry on next call


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "picamera": PICAMERA_AVAILABLE,
        "motion_enabled": motion_enabled,
        "last_motion": last_motion_ts,
    }


@app.get("/stream")
async def stream():
    boundary = "frame"

    def frame_generator():
        global picam, stream_active, stream_stop_requested, last_stream_start_ts
        stream_active = False
        stream_stop_requested = False

        if time.time() - last_stream_start_ts < STREAM_DEBOUNCE_SEC:
            frame = _placeholder_frame()
            yield (
                b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                + frame
                + b"\r\n"
            )
            return

        def _ensure_stream_camera() -> bool:
            global picam
            if picam is not None:
                return True
            try:
                picam = Picamera2()
                config = picam.create_video_configuration(main={"size": (640, 480)})
                picam.configure(config)
                picam.start()
                return True
            except Exception as e:
                print(f"Stream: Camera initialization failed: {e}")
                picam = None
                return False

        def _ensure_stream_camera_with_retry(attempts: int = 3, base_delay: float = 0.5) -> bool:
            for attempt in range(attempts):
                if _ensure_stream_camera():
                    return True
                time.sleep(base_delay * (attempt + 1))
            return False
        
        # Check if recording is in progress
        if recording_state["is_recording"]:
            # Return placeholder frames during recording
            while recording_state["is_recording"]:
                frame = _placeholder_frame()
                yield (
                    b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                    + frame
                    + b"\r\n"
                )
                time.sleep(0.5)
        
        if PICAMERA_AVAILABLE:
            # Stop and close existing camera completely
            _close_camera()
            
            time.sleep(0.5)  # Let camera hardware reset
            
            if not _ensure_stream_camera_with_retry():
                # Return placeholder frames
                for _ in range(100):
                    frame = _placeholder_frame()
                    yield (
                        b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                        + frame
                        + b"\r\n"
                    )
                    time.sleep(0.5)
                return
            
            encoder = MJPEGEncoder()
            output = io.BytesIO()

            class _StreamOutput(FileOutput):
                def outputframe(self, frame, keyframe=True, timestamp=None, packet=None, audio=None):
                    output.seek(0)
                    output.write(frame)
                    output.truncate()

            stream_output = _StreamOutput()
            if not _ensure_stream_camera_with_retry():
                while True:
                    frame = _placeholder_frame()
                    yield (
                        b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                        + frame
                        + b"\r\n"
                    )
                    time.sleep(0.5)
            picam.start_recording(encoder, stream_output)
            stream_active = True
            last_stream_start_ts = time.time()
            try:
                while True:
                    if stream_stop_requested:
                        break
                    if picam is None and not _ensure_stream_camera_with_retry():
                        frame = _placeholder_frame()
                        yield (
                            b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                            + frame
                            + b"\r\n"
                        )
                        time.sleep(0.5)
                        continue
                    # Pause streaming if recording starts
                    if recording_state["is_recording"]:
                        if picam:
                            picam.stop_recording()
                        # Return placeholder frames until recording completes
                        while recording_state["is_recording"]:
                            frame = _placeholder_frame()
                            yield (
                                b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                                + frame
                                + b"\r\n"
                            )
                            time.sleep(0.5)
                        # Restart streaming after recording
                        if not _ensure_stream_camera_with_retry():
                            continue
                        picam.start_recording(encoder, stream_output)
                    
                    frame = output.getvalue()
                    if frame:
                        _update_latest_stream_frame(frame)
                        yield (
                            b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                            + frame
                            + b"\r\n"
                        )
                    if latest_stream_frame_ts and (time.time() - last_stream_start_ts) > STREAM_WARMUP_SEC:
                        if (time.time() - latest_stream_frame_ts) > STREAM_STALE_SEC:
                            print("Stream stale: closing camera to restore motion")
                            break
                    time.sleep(0.03)
            finally:
                stream_active = False
                stream_stop_requested = False
                try:
                    picam.stop_recording()
                except:
                    pass
                try:
                    picam.stop()
                except:
                    pass
                try:
                    picam.close()
                except:
                    pass
                picam = None
        else:
            while True:
                frame = _placeholder_frame()
                yield (
                    b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                    + frame
                    + b"\r\n"
                )
                time.sleep(0.1)

    return StreamingResponse(
        frame_generator(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
    )


@app.post("/stream/stop")
async def stop_stream():
    global stream_stop_requested, stream_active
    stream_stop_requested = True
    stream_active = False
    _close_camera()
    return {"status": "stopped"}


@app.post("/photo")
async def photo():
    timestamp = int(time.time())
    output_path = MEDIA_DIR / f"photo_{timestamp}.jpg"

    if PICAMERA_AVAILABLE:
        _init_camera()
        if picam is not None:
            picam.capture_file(str(output_path))
        else:
            print("Photo endpoint: Camera not available, using placeholder")
            output_path.write_bytes(_placeholder_frame())
    else:
        output_path.write_bytes(_placeholder_frame())
    _upload_blob(output_path)
    return {"path": str(output_path), "timestamp": timestamp}


@app.get("/events")
async def events():
    photos = sorted(MEDIA_DIR.glob("photo_*.jpg"), reverse=True)
    motion = sorted(MEDIA_DIR.glob("motion_*.jpg"), reverse=True)
    clips = sorted(MEDIA_DIR.glob("motion_*.avi"), reverse=True)
    recordings = _list_recordings()
    payload = [
        {
            "filename": p.name,
            "path": str(p),
            "timestamp": p.stat().st_mtime,
        }
        for p in (recordings + clips + motion + photos)
    ]
    payload.sort(key=lambda item: item["timestamp"], reverse=True)
    return JSONResponse(payload)


@app.get("/recordings")
async def recordings():
    items = _list_recordings()
    payload = [
        {
            "filename": p.name,
            "path": str(p),
            "timestamp": p.stat().st_mtime,
        }
        for p in items
    ]
    return JSONResponse(payload)


@app.get("/rtc/status")
async def rtc_status():
    rtc = _get_rtc()
    if rtc is None:
        return JSONResponse({"error": rtc_error or "RTC not available"}, status_code=400)
    rtc_dt = rtc.datetime
    return {
        "rtc_time": rtc_dt.isoformat() if rtc_dt else None,
        "system_time": datetime.now().isoformat(),
    }


@app.post("/rtc/sync")
async def rtc_sync():
    rtc = _get_rtc()
    if rtc is None:
        return JSONResponse({"error": rtc_error or "RTC not available"}, status_code=400)
    rtc_dt = rtc.datetime
    if rtc_dt is None:
        return JSONResponse({"error": "RTC returned no time"}, status_code=500)
    try:
        subprocess.run(
            ["sudo", "date", "-s", rtc_dt.strftime("%Y-%m-%d %H:%M:%S")],
            check=True,
        )
        return {"status": "ok", "system_time": datetime.now().isoformat()}
    except Exception as exc:
        return JSONResponse({"error": f"RTC sync failed: {exc}"}, status_code=500)


@app.get("/media/{filename}")
async def get_media(filename: str):
    file_path = MEDIA_DIR / filename
    if not file_path.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(str(file_path))


@app.get("/azure/blobs")
async def list_azure_blobs(limit: int = 25):
    if container_client is None:
        return JSONResponse({"error": "Azure not configured"}, status_code=400)
    blobs = []
    try:
        for blob in container_client.list_blobs():
            blobs.append(
                {
                    "name": blob.name,
                    "size": blob.size,
                    "last_modified": blob.last_modified.isoformat()
                    if blob.last_modified
                    else None,
                }
            )
            if len(blobs) >= max(1, limit):
                break
    except Exception as exc:
        return JSONResponse({"error": f"Azure list failed: {exc}"}, status_code=500)
    return JSONResponse(blobs)


@app.get("/azure/media/{blob_name}")
async def get_azure_media(blob_name: str):
    if container_client is None:
        return JSONResponse({"error": "Azure not configured"}, status_code=400)
    try:
        blob_client = container_client.get_blob_client(blob_name)
        props = blob_client.get_blob_properties()
        content_type = None
        if props.content_settings and props.content_settings.content_type:
            content_type = props.content_settings.content_type
        download = blob_client.download_blob()
        return StreamingResponse(download.chunks(), media_type=content_type)
    except Exception as exc:
        return JSONResponse({"error": f"Azure fetch failed: {exc}"}, status_code=500)


@app.post("/arm")
async def arm_motion():
    global motion_enabled, background_frame, motion_enabled_since
    motion_enabled = True
    background_frame = None
    motion_enabled_since = time.time()
    return {"motion_enabled": motion_enabled}


@app.post("/disarm")
async def disarm_motion():
    global motion_enabled, motion_enabled_since
    motion_enabled = False
    motion_enabled_since = None
    return {"motion_enabled": motion_enabled}


@app.get("/motion/settings")
async def get_motion_settings():
    """Get current motion detection settings"""
    return {
        "threshold": MOTION_THRESHOLD,
        "min_area": MOTION_MIN_AREA,
        "cooldown": NOTIFICATION_COOLDOWN
    }


class MotionSettings(BaseModel):
    threshold: Optional[int] = None
    min_area: Optional[int] = None
    cooldown: Optional[int] = None


@app.post("/motion/settings")
async def update_motion_settings(settings: MotionSettings):
    """Update motion detection settings"""
    global MOTION_THRESHOLD, MOTION_MIN_AREA, NOTIFICATION_COOLDOWN
    
    if settings.threshold is not None:
        MOTION_THRESHOLD = max(1, min(50, settings.threshold))
    if settings.min_area is not None:
        MOTION_MIN_AREA = max(5, min(1000, settings.min_area))
    if settings.cooldown is not None:
        NOTIFICATION_COOLDOWN = max(5, min(300, settings.cooldown))
    
    # Update .env file
    env_file = BASE_DIR / ".env"
    env_lines = []
    if env_file.exists():
        env_lines = env_file.read_text().splitlines()
    
    # Update or add settings
    settings_map = {
        "MOTION_THRESHOLD": str(MOTION_THRESHOLD),
        "MOTION_MIN_AREA": str(MOTION_MIN_AREA),
        "NOTIFICATION_COOLDOWN": str(NOTIFICATION_COOLDOWN)
    }
    
    for key, value in settings_map.items():
        found = False
        for i, line in enumerate(env_lines):
            if line.startswith(f"{key}="):
                env_lines[i] = f"{key}={value}"
                found = True
                break
        if not found:
            env_lines.append(f"{key}={value}")
    
    env_file.write_text("\n".join(env_lines) + "\n")
    
    return {
        "threshold": MOTION_THRESHOLD,
        "min_area": MOTION_MIN_AREA,
        "cooldown": NOTIFICATION_COOLDOWN,
        "updated": True
    }


@app.get("/status")
async def status():
    return {
        "motion_enabled": motion_enabled,
        "last_motion": last_motion_ts,
    }


@app.get("/motion/debug")
async def motion_debug():
    return {
        "motion_enabled": motion_enabled,
        "last_motion": last_motion_ts,
        "last_notification_time": last_notification_time,
        "background_frame_set": background_frame is not None,
        "stream_active": stream_active,
        "latest_stream_frame_age_sec": round(time.time() - latest_stream_frame_ts, 2)
        if latest_stream_frame_ts
        else None,
        "push_tokens": len(push_tokens),
    }


@app.get("/motion/metrics")
async def motion_metrics_endpoint():
    return {
        **motion_metrics,
        "motion_enabled": motion_enabled,
        "background_frame_set": background_frame is not None,
    }


@app.get("/notifications")
async def notifications():
    return JSONResponse(list(reversed(motion_notifications)))

@app.post("/notifications/register")
async def register_push_token(req: PushTokenRequest):
    """Register a device's Expo push token for motion notifications"""
    push_tokens.add(req.token)
    _save_push_tokens()
    return {"status": "registered", "token": req.token}


@app.post("/notifications/unregister")
async def unregister_push_token(req: PushTokenRequest):
    """Unregister a device's Expo push token to disable motion notifications"""
    push_tokens.discard(req.token)
    _save_push_tokens()
    return {"status": "unregistered", "token": req.token}


@app.post("/motion/test")
async def motion_test():
    """Trigger a test motion notification to verify push delivery."""
    global last_notification_time
    last_notification_time = time.time()
    threading.Thread(
        target=_send_push_notification_sync,
        args=(
            "Motion Test",
            "sPiCam test notification. This confirms push delivery.",
            {"type": "motion_test"}
        ),
        daemon=True,
    ).start()
    _add_notification("Motion test - notification sent", "motion")
    return {"status": "sent", "tokens": len(push_tokens)}

@app.post("/record/start")
async def start_recording(req: RecordRequest):
    """Start manual video recording for specified duration"""
    global recording_state
    
    if recording_state["is_recording"]:
        return {"error": "Recording already in progress"}
    
    if not PICAMERA_AVAILABLE:
        return {"error": "Camera not available"}
    
    duration = max(5, min(120, req.duration))  # Clamp between 5-120 seconds
    recording_state = {
        "is_recording": True,
        "duration": duration,
        "start_time": time.time()
    }
    
    # Start recording in background thread
    threading.Thread(target=_record_video, args=(duration,), daemon=True).start()
    
    return {
        "status": "recording",
        "duration": duration,
        "message": f"Recording for {duration} seconds"
    }

def _record_video(duration: int):
    """Record video for specified duration"""
    global recording_state, motion_enabled, picam
    
    # Store original motion state and temporarily disable it
    original_motion_state = motion_enabled
    motion_enabled = False
    time.sleep(1.0)  # Give motion loop and streaming time to stop
    
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_path = MEDIA_DIR / f"recording_{timestamp}.h264"
        mp4_path = video_path.with_suffix('.mp4')
        
        if not PICAMERA_AVAILABLE:
            print("Camera not available for recording")
            return
        
        # Stop all camera operations
        if picam:
            try:
                picam.stop_recording()
            except:
                pass
            try:
                picam.stop()
            except:
                pass
            try:
                picam.close()
            except:
                pass
        
        time.sleep(0.5)  # Let hardware reset
        
        # Reinitialize camera for video recording
        picam = Picamera2()
        video_config = picam.create_video_configuration(
            main={"size": (1920, 1080), "format": "RGB888"}
        )
        picam.configure(video_config)
        picam.start()
        
        # Record video
        encoder = H264Encoder()
        picam.start_recording(encoder, str(video_path))
        print(f"Recording started: {video_path}")
        time.sleep(duration)
        if picam:
            picam.stop_recording()
            picam.stop()
            try:
                picam.close()
            except:
                pass
        else:
            print("Recording stopped: camera unavailable")
        print(f"Recording stopped: {video_path}")
        
        # Convert to mp4 when ffmpeg is available; otherwise keep h264.
        if shutil.which("ffmpeg"):
            try:
                subprocess.run(
                    ["ffmpeg", "-i", str(video_path), "-c:v", "copy", str(mp4_path)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f"FFmpeg conversion successful: {mp4_path}")
                video_path.unlink()  # Remove h264 file
                final_path = mp4_path
            except Exception as convert_err:
                print(f"FFmpeg conversion error: {convert_err}")
                final_path = video_path
        else:
            print("FFmpeg not found; keeping raw h264 recording")
            final_path = video_path
        
        # Verify file exists
        if final_path.exists():
            print(f"Video saved successfully: {final_path}, size: {final_path.stat().st_size} bytes")
            
            # Upload to Azure if configured
            if container_client and final_path.suffix == ".mp4":
                try:
                    blob_name = f"recordings/{final_path.name}"
                    content_type = "video/mp4"
                    with open(final_path, "rb") as data:
                        container_client.upload_blob(
                            name=blob_name,
                            data=data,
                            overwrite=True,
                            content_settings=ContentSettings(content_type=content_type)
                        )
                    print(f"Uploaded to Azure: {blob_name}")
                except Exception as upload_err:
                    print(f"Azure upload error: {upload_err}")
            elif container_client:
                print("Skipping Azure upload for non-mp4 recording")
        else:
            print(f"ERROR: Video file not found: {final_path}")
        
        if final_path.suffix == ".mp4":
            motion_notifications.insert(0, {
                "message": f"Recording ready: {final_path.name}",
                "kind": "recording",
                "timestamp": datetime.now().isoformat()
            })
            threading.Thread(target=_send_push_notification_sync, args=(
                "Recording Ready",
                f"Recording ready: {final_path.name}",
                {"type": "recording_ready", "filename": final_path.name}
            ), daemon=True).start()
        if len(motion_notifications) > MOTION_NOTIFICATIONS_MAX:
            motion_notifications.pop()
        
        # Reinitialize camera for streaming
        picam = None  # Force reinitialization
    
    except Exception as e:
        print(f"Recording error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Restore motion detection state
        motion_enabled = original_motion_state
        recording_state = {"is_recording": False, "duration": 0, "start_time": None}
        # Camera will be reinitialized by next stream/motion request

async def _send_push_notification(title: str, body: str, data: dict = None):
    """Send push notification to all registered devices"""
    import httpx
    
    if not push_tokens:
        return
    
    messages = []
    for token in push_tokens:
        messages.append({
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {}
        })
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                'https://exp.host/--/api/v2/push/send',
                json=messages,
                headers={'Content-Type': 'application/json'}
            )
        try:
            payload = response.json()
        except Exception:
            payload = response.text
        print(
            f"Push notification response: status={response.status_code} tokens={len(push_tokens)} payload={payload}"
        )
    except Exception as e:
        print(f"Push notification error: {e}")

def _send_push_notification_sync(title: str, body: str, data: dict = None):
    """Synchronous wrapper for sending push notifications from threads"""
    import asyncio
    try:
        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_send_push_notification(title, body, data))
        loop.close()
    except Exception as e:
        print(f"Push notification sync error: {e}")


def _motion_loop():
    global background_frame, motion_enabled_since
    while True:
        if not motion_enabled:
            time.sleep(0.5)
            continue
        frame = _get_frame_array()
        if frame is None:
            time.sleep(0.5)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if motion_enabled_since and (time.time() - motion_enabled_since) < MOTION_WARMUP_SEC:
            background_frame = gray
            time.sleep(0.1)
            continue

        if background_frame is None:
            background_frame = gray
            time.sleep(0.1)
            continue

        delta = cv2.absdiff(background_frame, gray)
        motion_metrics["last_delta_mean"] = float(delta.mean())
        motion_metrics["last_delta_max"] = float(delta.max())
        thresh = cv2.threshold(delta, MOTION_THRESHOLD, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=2)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        motion_metrics["last_contour_count"] = len(contours)
        motion_metrics["last_contour_area"] = max((cv2.contourArea(c) for c in contours), default=0.0)
        motion_metrics["last_frame_ts"] = time.time()

        for c in contours:
            if cv2.contourArea(c) < MOTION_MIN_AREA:
                continue
            
            # Check cooldown before sending notification
            global last_notification_time
            current_time = time.time()
            if last_notification_time is None or (current_time - last_notification_time) >= NOTIFICATION_COOLDOWN:
                # Send push notification on motion detection
                threading.Thread(target=_send_push_notification_sync, args=(
                    "Motion Detected",
                    "sPiCam detected motion. Tap to start recording.",
                    {"type": "motion_detected"}
                ), daemon=True).start()
                
                last_notification_time = current_time
                
                # Add notification to UI
                motion_notifications.insert(0, {
                    "message": "Motion detected - notification sent",
                    "kind": "motion",
                    "timestamp": datetime.now().isoformat()
                })
                if len(motion_notifications) > MOTION_NOTIFICATIONS_MAX:
                    motion_notifications.pop()
            
            break

        background_frame = gray
        time.sleep(0.2)


def _start_motion_thread():
    global motion_thread
    if motion_thread and motion_thread.is_alive():
        return
    motion_thread = threading.Thread(target=_motion_loop, daemon=True)
    motion_thread.start()


# Delay motion thread start to let server initialize
def delayed_motion_start():
    print("Delaying motion thread start for 5 seconds...")
    time.sleep(5)
    print("Starting motion detection thread")
    _start_motion_thread()

# Start button handler thread
def start_button_handler():
    if SHUTTER_BUTTON_ENABLED:
        print("Starting physical shutter button handler...")
        threading.Thread(target=_button_handler, daemon=True).start()

_load_push_tokens()
threading.Thread(target=delayed_motion_start, daemon=True).start()
threading.Thread(target=start_button_handler, daemon=True).start()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
