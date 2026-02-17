from fastapi import FastAPI
from pathlib import Path
import time
import threading

try:
    from picamera2 import Picamera2  # noqa: F401
    PICAMERA_AVAILABLE = True
except Exception:
    PICAMERA_AVAILABLE = False

from config import settings, BASE_DIR
from models import RecordRequest, MotionSettings
from routers import azure_router, create_camera_router, create_events_router, create_notifications_router, create_motion_router
from services import azure_service, notification_service, MotionService, CameraService, ButtonService, StartupService
from utils import cleanup_old_media

app = FastAPI()
app.include_router(azure_router)
MEDIA_DIR = settings.media_dir
MEDIA_DIR.mkdir(exist_ok=True)

if not azure_service.is_configured:
    print("[PiCam] Azure upload disabled: AZURE_STORAGE_CONNECTION_STRING not set")

STREAM_STALE_SEC = settings.stream_stale_sec
STREAM_DEBOUNCE_SEC = settings.stream_debounce_sec
STREAM_WARMUP_SEC = settings.stream_warmup_sec

SHUTTER_BUTTON_ENABLED = settings.shutter_button_enabled
SHUTTER_BUTTON_GPIO = settings.shutter_button_gpio
MEDIA_RETENTION_DAYS = settings.media_retention_days
recording_state = {"is_recording": False, "duration": 0, "start_time": None}

camera_service = CameraService(
    picamera_available=PICAMERA_AVAILABLE,
    stream_stale_sec=STREAM_STALE_SEC,
    stream_debounce_sec=STREAM_DEBOUNCE_SEC,
    stream_warmup_sec=STREAM_WARMUP_SEC,
    is_recording=lambda: recording_state["is_recording"],
)
def _capture_photo():
    """Internal function to capture a photo (called by button handler)"""
    timestamp = int(time.time())
    output_path = MEDIA_DIR / f"photo_{timestamp}.jpg"

    camera_service.capture_photo(output_path)
    print(f"[PiCam] Photo captured: {output_path.name}")
    
    _upload_blob(output_path)
    _add_notification(f"Photo captured: {output_path.name}", "photo")
    
    # Send push notification
    threading.Thread(target=_send_push_notification_sync, args=(
        "Photo Captured",
        f"Photo captured: {output_path.name}",
        {"type": "photo_captured", "filename": output_path.name}
    ), daemon=True).start()


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
    
    # Send push notification
    _add_notification(f"Recording started: {duration}s video", "recording")
    threading.Thread(target=_send_push_notification_sync, args=(
        "Recording Started",
        f"Recording {duration}s video...",
        {"type": "recording_started", "duration": duration}
    ), daemon=True).start()
def _add_notification(message: str, kind: str = "info"):
    notification_service.add_notification(message, kind)


def _cleanup_old_media():
    """Delete media files older than MEDIA_RETENTION_DAYS."""
    cleanup_old_media(MEDIA_DIR, MEDIA_RETENTION_DAYS)


def _upload_blob(path: Path):
    if not azure_service.is_configured:
        print(f"[PiCam] Azure upload skipped for {path.name}")
        return
    try:
        azure_service.upload_path(path)
        print(f"[PiCam] Azure upload ok: {path.name}")
    except Exception as exc:
        print(f"[PiCam] Azure upload failed for {path.name}: {exc}")


def _load_push_tokens() -> None:
    notification_service.load_push_tokens()


def _list_recordings() -> list[Path]:
    mp4_files = sorted(MEDIA_DIR.glob("recording_*.mp4"), reverse=True)
    mp4_stems = {path.stem for path in mp4_files}
    h264_files = sorted(MEDIA_DIR.glob("recording_*.h264"), reverse=True)
    h264_filtered = [path for path in h264_files if path.stem not in mp4_stems]
    return mp4_files + h264_filtered


app.include_router(create_events_router(MEDIA_DIR, _list_recordings))
app.include_router(create_notifications_router(notification_service))


def health():
    return {
        "status": "ok",
        "picamera": PICAMERA_AVAILABLE,
        "motion_enabled": motion_service.motion_enabled,
        "last_motion": motion_service.last_motion_ts,
    }


def stream():
    return camera_service.stream_response()


def stop_stream():
    return camera_service.stop_stream()


def photo():
    timestamp = int(time.time())
    output_path = MEDIA_DIR / f"photo_{timestamp}.jpg"

    camera_service.capture_photo(output_path)
    _upload_blob(output_path)
    return {"path": str(output_path), "timestamp": timestamp}


def arm_motion():
    return motion_service.arm()


def disarm_motion():
    return motion_service.disarm()


def get_motion_settings():
    return motion_service.get_settings()


def update_motion_settings(settings: MotionSettings):
    env_file = BASE_DIR / ".env"
    return motion_service.update_settings(settings.threshold, settings.min_area, settings.cooldown, env_file)


def status():
    return motion_service.status()


def motion_debug():
    return motion_service.debug(
        camera_service.stream_active,
        camera_service.latest_stream_frame_ts,
        notification_service.token_count,
    )


def motion_metrics_endpoint():
    return motion_service.metrics()


def motion_test():
    result = motion_service.run_motion_test()
    return {**result, "tokens": notification_service.token_count}

def start_recording(req: RecordRequest):
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
    
    # Store original motion state and temporarily disable it
    original_motion_state = motion_service.motion_enabled
    motion_service.motion_enabled = False
    time.sleep(1.0)  # Give motion loop and streaming time to stop
    
    try:
        final_path = camera_service.record_video(duration, MEDIA_DIR)
        if final_path is None:
            return

        if azure_service.is_configured and final_path.suffix == ".mp4":
            try:
                blob_name = f"recordings/{final_path.name}"
                azure_service.upload_path(final_path, blob_name=blob_name)
                print(f"Uploaded to Azure: {blob_name}")
            except Exception as upload_err:
                print(f"Azure upload error: {upload_err}")
        elif azure_service.is_configured:
            print("Skipping Azure upload for non-mp4 recording")
        
        if final_path.suffix == ".mp4":
            _add_notification(f"Recording ready: {final_path.name}", "recording")
            threading.Thread(target=_send_push_notification_sync, args=(
                "Recording Ready",
                f"Recording ready: {final_path.name}",
                {"type": "recording_ready", "filename": final_path.name}
            ), daemon=True).start()
        
    except Exception as e:
        print(f"Recording error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Restore motion detection state
        motion_service.motion_enabled = original_motion_state
        recording_state = {"is_recording": False, "duration": 0, "start_time": None}
        # Camera will be reinitialized by next stream/motion request

async def _send_push_notification(title: str, body: str, data: dict = None):
    """Send push notification to all registered devices"""
    await notification_service.send_push_notification(title, body, data)

def _send_push_notification_sync(title: str, body: str, data: dict = None):
    """Synchronous wrapper for sending push notifications from threads"""
    notification_service.send_push_notification_sync(title, body, data)


motion_service = MotionService(
    get_frame_array=camera_service.get_frame_array,
    send_push_notification_sync=_send_push_notification_sync,
    add_notification=_add_notification,
    threshold=settings.motion_threshold,
    min_area=settings.motion_min_area,
    cooldown=settings.notification_cooldown,
    warmup_sec=settings.motion_warmup_sec,
)


def _start_motion_thread():
    motion_service.start_thread()


button_service = ButtonService(
    enabled=SHUTTER_BUTTON_ENABLED,
    gpio_pin=SHUTTER_BUTTON_GPIO,
    capture_photo=_capture_photo,
    start_recording=_start_recording,
)

startup_service = StartupService(
    start_motion_thread=_start_motion_thread,
    start_button_handler=button_service.start,
    run_cleanup=_cleanup_old_media,
)


app.include_router(
    create_camera_router(
        health_fn=health,
        stream_fn=stream,
        stop_stream_fn=stop_stream,
        photo_fn=photo,
        record_start_fn=start_recording,
    )
)


app.include_router(
    create_motion_router(
        arm_fn=arm_motion,
        disarm_fn=disarm_motion,
        get_motion_settings_fn=get_motion_settings,
        update_motion_settings_fn=update_motion_settings,
        status_fn=status,
        motion_debug_fn=motion_debug,
        motion_metrics_fn=motion_metrics_endpoint,
        motion_test_fn=motion_test,
    )
)

_load_push_tokens()
startup_service.start_background_tasks()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
