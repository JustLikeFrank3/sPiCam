from fastapi import FastAPI

try:
    from picamera2 import Picamera2  # noqa: F401
    PICAMERA_AVAILABLE = True
except Exception:
    PICAMERA_AVAILABLE = False

from config import settings
from routers import azure_router, create_camera_router, create_events_router, create_notifications_router, create_motion_router
from services import (
    azure_service,
    notification_service,
    MotionService,
    CameraService,
    ButtonService,
    StartupService,
    BackendService,
)

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

motion_service = MotionService(
    get_frame_array=camera_service.get_frame_array,
    send_push_notification_sync=notification_service.send_push_notification_sync,
    add_notification=notification_service.add_notification,
    threshold=settings.motion_threshold,
    min_area=settings.motion_min_area,
    cooldown=settings.notification_cooldown,
    warmup_sec=settings.motion_warmup_sec,
)

backend_service = BackendService(
    media_dir=MEDIA_DIR,
    media_retention_days=MEDIA_RETENTION_DAYS,
    recording_state=recording_state,
    camera_service=camera_service,
    motion_service=motion_service,
    notification_service=notification_service,
    azure_service=azure_service,
)

app.include_router(create_events_router(MEDIA_DIR, backend_service.list_recordings))
app.include_router(create_notifications_router(notification_service))


def _start_motion_thread() -> None:
    motion_service.start_thread()


button_service = ButtonService(
    enabled=SHUTTER_BUTTON_ENABLED,
    gpio_pin=SHUTTER_BUTTON_GPIO,
    capture_photo=backend_service.capture_photo_internal,
    start_recording=backend_service.start_recording_internal,
)

startup_service = StartupService(
    start_motion_thread=_start_motion_thread,
    start_button_handler=button_service.start,
    run_cleanup=backend_service.cleanup_old_media,
)


app.include_router(
    create_camera_router(
        health_fn=backend_service.health,
        stream_fn=backend_service.stream,
        stop_stream_fn=backend_service.stop_stream,
        photo_fn=backend_service.photo,
        record_start_fn=backend_service.start_recording,
    )
)


app.include_router(
    create_motion_router(
        arm_fn=backend_service.arm_motion,
        disarm_fn=backend_service.disarm_motion,
        get_motion_settings_fn=backend_service.get_motion_settings,
        update_motion_settings_fn=backend_service.update_motion_settings,
        status_fn=backend_service.status,
        motion_debug_fn=backend_service.motion_debug,
        motion_metrics_fn=backend_service.motion_metrics,
        motion_test_fn=backend_service.motion_test,
    )
)

backend_service.load_push_tokens()
startup_service.start_background_tasks()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
