from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pathlib import Path
import io
import time
import threading
from typing import Optional
import os
from dotenv import load_dotenv
from datetime import datetime
import subprocess
from pydantic import BaseModel

try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder
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
motion_lock = threading.Lock()
background_frame: Optional[np.ndarray] = None
motion_thread: Optional[threading.Thread] = None
recording_clip = False

AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "images")
blob_service: Optional[BlobServiceClient] = None
container_client = None

if AZURE_CONNECTION_STRING:
    blob_service = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)
    container_client = blob_service.get_container_client(AZURE_CONTAINER)
else:
    print("[PiCam] Azure upload disabled: AZURE_STORAGE_CONNECTION_STRING not set")

MOTION_THRESHOLD = 18
MOTION_MIN_AREA = 500
MOTION_COOLDOWN_SEC = 3
CLIP_SECONDS = 3
CLIP_FPS = 8
MOTION_SAVE_CLIPS = os.getenv("MOTION_SAVE_CLIPS", "0") == "1"

SERVO_ENABLED = os.getenv("SERVO_ENABLED", "0") == "1"
SERVO_PAN_CHANNEL = int(os.getenv("SERVO_PAN_CHANNEL", "0"))
SERVO_TILT_CHANNEL = int(os.getenv("SERVO_TILT_CHANNEL", "1"))
SERVO_PAN_MIN = int(os.getenv("SERVO_PAN_MIN", "10"))
SERVO_PAN_MAX = int(os.getenv("SERVO_PAN_MAX", "170"))
SERVO_TILT_MIN = int(os.getenv("SERVO_TILT_MIN", "10"))
SERVO_TILT_MAX = int(os.getenv("SERVO_TILT_MAX", "170"))
RTC_ENABLED = os.getenv("RTC_ENABLED", "0") == "1"

servo_kit = None
servo_error: Optional[str] = None
servo_state = {"pan": None, "tilt": None}
rtc_device = None
rtc_error: Optional[str] = None
motion_notifications = []
MOTION_NOTIFICATIONS_MAX = 50
push_tokens = set()
recording_state = {"is_recording": False, "duration": 0, "start_time": None}


class PanTiltRequest(BaseModel):
    pan: Optional[float] = None
    tilt: Optional[float] = None

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


def _get_frame_array() -> Optional[np.ndarray]:
    if PICAMERA_AVAILABLE:
        _init_camera()
        frame = picam.capture_array()
        return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    placeholder = _placeholder_frame()
    img = cv2.imdecode(np.frombuffer(placeholder, np.uint8), cv2.IMREAD_COLOR)
    return img


def _clamp(value: float, minimum: int, maximum: int) -> float:
    return max(minimum, min(maximum, value))


def _init_servos():
    global servo_kit, servo_error
    if servo_kit is not None or servo_error is not None or not SERVO_ENABLED:
        return
    try:
        from adafruit_servokit import ServoKit

        servo_kit = ServoKit(channels=16)
        center_pan = (SERVO_PAN_MIN + SERVO_PAN_MAX) / 2
        center_tilt = (SERVO_TILT_MIN + SERVO_TILT_MAX) / 2
        servo_state["pan"] = center_pan
        servo_state["tilt"] = center_tilt
        servo_kit.servo[SERVO_PAN_CHANNEL].angle = center_pan
        servo_kit.servo[SERVO_TILT_CHANNEL].angle = center_tilt
    except Exception as exc:
        servo_error = str(exc)
        print(f"[PiCam] Servo init failed: {exc}")


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


def _init_camera():
    global picam
    if not PICAMERA_AVAILABLE:
        return
    if picam is None:
        picam = Picamera2()
        config = picam.create_video_configuration(main={"size": (640, 480)})
        picam.configure(config)
        picam.start()


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
        if PICAMERA_AVAILABLE:
            _init_camera()
            encoder = MJPEGEncoder()
            output = io.BytesIO()

            class _StreamOutput(FileOutput):
                def outputframe(self, frame):
                    output.seek(0)
                    output.write(frame)
                    output.truncate()

            stream_output = _StreamOutput()
            picam.start_recording(encoder, stream_output)
            try:
                while True:
                    frame = output.getvalue()
                    if frame:
                        yield (
                            b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()
                            + frame
                            + b"\r\n"
                        )
                    time.sleep(0.03)
            finally:
                picam.stop_recording()
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


@app.post("/photo")
async def photo():
    timestamp = int(time.time())
    output_path = MEDIA_DIR / f"photo_{timestamp}.jpg"

    if PICAMERA_AVAILABLE:
        _init_camera()
        picam.capture_file(str(output_path))
    else:
        output_path.write_bytes(_placeholder_frame())
    _upload_blob(output_path)
    return {"path": str(output_path), "timestamp": timestamp}


@app.get("/pan_tilt")
async def pan_tilt_status():
    _init_servos()
    return {
        "enabled": SERVO_ENABLED,
        "available": servo_kit is not None,
        "error": servo_error,
        "pan": servo_state.get("pan"),
        "tilt": servo_state.get("tilt"),
    }


@app.post("/pan_tilt")
async def pan_tilt_set(payload: PanTiltRequest):
    _init_servos()
    if servo_kit is None:
        return JSONResponse({"error": servo_error or "Servo not available"}, status_code=400)
    if payload.pan is not None:
        next_pan = _clamp(payload.pan, SERVO_PAN_MIN, SERVO_PAN_MAX)
        servo_kit.servo[SERVO_PAN_CHANNEL].angle = next_pan
        servo_state["pan"] = next_pan
    if payload.tilt is not None:
        next_tilt = _clamp(payload.tilt, SERVO_TILT_MIN, SERVO_TILT_MAX)
        servo_kit.servo[SERVO_TILT_CHANNEL].angle = next_tilt
        servo_state["tilt"] = next_tilt
    return {"pan": servo_state.get("pan"), "tilt": servo_state.get("tilt")}


@app.post("/pan_tilt/center")
async def pan_tilt_center():
    _init_servos()
    if servo_kit is None:
        return JSONResponse({"error": servo_error or "Servo not available"}, status_code=400)
    center_pan = (SERVO_PAN_MIN + SERVO_PAN_MAX) / 2
    center_tilt = (SERVO_TILT_MIN + SERVO_TILT_MAX) / 2
    servo_kit.servo[SERVO_PAN_CHANNEL].angle = center_pan
    servo_kit.servo[SERVO_TILT_CHANNEL].angle = center_tilt
    servo_state["pan"] = center_pan
    servo_state["tilt"] = center_tilt
    return {"pan": servo_state.get("pan"), "tilt": servo_state.get("tilt")}


@app.get("/events")
async def events():
    photos = sorted(MEDIA_DIR.glob("photo_*.jpg"), reverse=True)
    motion = sorted(MEDIA_DIR.glob("motion_*.jpg"), reverse=True)
    clips = sorted(MEDIA_DIR.glob("motion_*.avi"), reverse=True)
    payload = [
        {
            "filename": p.name,
            "path": str(p),
            "timestamp": p.stat().st_mtime,
        }
        for p in (clips + motion + photos)
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
    global motion_enabled
    motion_enabled = True
    return {"motion_enabled": motion_enabled}


@app.post("/disarm")
async def disarm_motion():
    global motion_enabled
    motion_enabled = False
    return {"motion_enabled": motion_enabled}


@app.get("/status")
async def status():
    return {
        "motion_enabled": motion_enabled,
        "last_motion": last_motion_ts,
    }


@app.get("/notifications")
async def notifications():
    return JSONResponse(list(reversed(motion_notifications)))

@app.post("/notifications/register")
async def register_push_token(req: PushTokenRequest):
    """Register a device's Expo push token for motion notifications"""
    push_tokens.add(req.token)
    return {"status": "registered", "token": req.token}

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
    global recording_state
    
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_path = MEDIA_DIR / f"recording_{timestamp}.h264"
        
        if picam:
            # Configure for video recording
            config = picam.create_video_configuration()
            picam.configure(config)
            output = str(video_path)
            
            picam.start_recording(output)
            time.sleep(duration)
            picam.stop_recording()
            
            # Convert to mp4 if possible
            try:
                mp4_path = video_path.with_suffix('.mp4')
                subprocess.run([
                    'ffmpeg', '-i', str(video_path),
                    '-c:v', 'copy', str(mp4_path)
                ], check=True, capture_output=True)
                video_path.unlink()  # Remove h264 file
                final_path = mp4_path
            except:
                final_path = video_path
            
            # Add to notifications
            motion_notifications.insert(0, {
                "message": f"Manual recording saved: {final_path.name}",
                "kind": "recording",
                "timestamp": datetime.now().isoformat()
            })
            if len(motion_notifications) > MOTION_NOTIFICATIONS_MAX:
                motion_notifications.pop()
    
    except Exception as e:
        print(f"Recording error: {e}")
    finally:
        recording_state = {"is_recording": False, "duration": 0, "start_time": None}

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
            await client.post(
                'https://exp.host/--/api/v2/push/send',
                json=messages,
                headers={'Content-Type': 'application/json'}
            )
    except Exception as e:
        print(f"Push notification error: {e}")


def _motion_loop():
    global background_frame
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

        if background_frame is None:
            background_frame = gray
            time.sleep(0.1)
            continue

        delta = cv2.absdiff(background_frame, gray)
        thresh = cv2.threshold(delta, MOTION_THRESHOLD, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=2)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for c in contours:
            if cv2.contourArea(c) < MOTION_MIN_AREA:
                continue
            _save_motion_snapshot(frame)
            if MOTION_SAVE_CLIPS:
                threading.Thread(target=_save_motion_clip, daemon=True).start()
            
            # Send push notification on motion detection
            import asyncio
            try:
                asyncio.create_task(_send_push_notification(
                    "Motion Detected",
                    "sPiCam detected motion. Tap to start recording.",
                    {"type": "motion_detected"}
                ))
            except:
                pass
            
            break

        background_frame = gray
        time.sleep(0.2)


def _start_motion_thread():
    global motion_thread
    if motion_thread and motion_thread.is_alive():
        return
    motion_thread = threading.Thread(target=_motion_loop, daemon=True)
    motion_thread.start()


_start_motion_thread()
