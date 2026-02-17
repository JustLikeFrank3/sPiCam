import threading
import time
from pathlib import Path

from config import BASE_DIR
from models import MotionSettings, RecordRequest
from services.azure_service import AzureService
from services.camera_service import CameraService
from services.motion_service import MotionService
from services.notification_service import NotificationService
from utils import cleanup_old_media


class BackendService:
    def __init__(
        self,
        media_dir: Path,
        media_retention_days: int,
        recording_state: dict,
        camera_service: CameraService,
        motion_service: MotionService,
        notification_service: NotificationService,
        azure_service: AzureService,
    ) -> None:
        self.media_dir = media_dir
        self.media_retention_days = media_retention_days
        self.recording_state = recording_state
        self.camera_service = camera_service
        self.motion_service = motion_service
        self.notification_service = notification_service
        self.azure_service = azure_service

    def _add_notification(self, message: str, kind: str = "info") -> None:
        self.notification_service.add_notification(message, kind)

    def _upload_blob(self, path: Path) -> None:
        if not self.azure_service.is_configured:
            print(f"[PiCam] Azure upload skipped for {path.name}")
            return
        try:
            self.azure_service.upload_path(path)
            print(f"[PiCam] Azure upload ok: {path.name}")
        except Exception as exc:
            print(f"[PiCam] Azure upload failed for {path.name}: {exc}")

    def load_push_tokens(self) -> None:
        self.notification_service.load_push_tokens()

    def list_recordings(self) -> list[Path]:
        mp4_files = sorted(self.media_dir.glob("recording_*.mp4"), reverse=True)
        mp4_stems = {path.stem for path in mp4_files}
        h264_files = sorted(self.media_dir.glob("recording_*.h264"), reverse=True)
        h264_filtered = [path for path in h264_files if path.stem not in mp4_stems]
        return mp4_files + h264_filtered

    def cleanup_old_media(self) -> None:
        cleanup_old_media(self.media_dir, self.media_retention_days)

    def health(self) -> dict:
        return {
            "status": "ok",
            "picamera": self.camera_service.picamera_available,
            "motion_enabled": self.motion_service.motion_enabled,
            "last_motion": self.motion_service.last_motion_ts,
        }

    def stream(self):
        return self.camera_service.stream_response()

    def stop_stream(self) -> dict:
        return self.camera_service.stop_stream()

    def photo(self) -> dict:
        timestamp = int(time.time())
        output_path = self.media_dir / f"photo_{timestamp}.jpg"
        self.camera_service.capture_photo(output_path)
        self._upload_blob(output_path)
        return {"path": str(output_path), "timestamp": timestamp}

    def capture_photo_internal(self) -> None:
        timestamp = int(time.time())
        output_path = self.media_dir / f"photo_{timestamp}.jpg"
        self.camera_service.capture_photo(output_path)
        print(f"[PiCam] Photo captured: {output_path.name}")
        self._upload_blob(output_path)
        self._add_notification(f"Photo captured: {output_path.name}", "photo")
        threading.Thread(
            target=self.notification_service.send_push_notification_sync,
            args=(
                "Photo Captured",
                f"Photo captured: {output_path.name}",
                {"type": "photo_captured", "filename": output_path.name},
            ),
            daemon=True,
        ).start()

    def arm_motion(self) -> dict:
        return self.motion_service.arm()

    def disarm_motion(self) -> dict:
        return self.motion_service.disarm()

    def get_motion_settings(self) -> dict:
        return self.motion_service.get_settings()

    def update_motion_settings(self, settings: MotionSettings) -> dict:
        env_file = BASE_DIR / ".env"
        return self.motion_service.update_settings(settings.threshold, settings.min_area, settings.cooldown, env_file)

    def status(self) -> dict:
        return self.motion_service.status()

    def motion_debug(self) -> dict:
        return self.motion_service.debug(
            self.camera_service.stream_active,
            self.camera_service.latest_stream_frame_ts,
            self.notification_service.token_count,
        )

    def motion_metrics(self) -> dict:
        return self.motion_service.metrics()

    def motion_test(self) -> dict:
        result = self.motion_service.run_motion_test()
        return {**result, "tokens": self.notification_service.token_count}

    def start_recording(self, req: RecordRequest) -> dict:
        if self.recording_state["is_recording"]:
            return {"error": "Recording already in progress"}
        if not self.camera_service.picamera_available:
            return {"error": "Camera not available"}

        duration = max(5, min(120, req.duration))
        self.recording_state.update({"is_recording": True, "duration": duration, "start_time": time.time()})
        threading.Thread(target=self._record_video, args=(duration,), daemon=True).start()
        return {
            "status": "recording",
            "duration": duration,
            "message": f"Recording for {duration} seconds",
        }

    def start_recording_internal(self, duration: int) -> None:
        if self.recording_state["is_recording"]:
            print("[PiCam] Recording already in progress, ignoring button press")
            return
        if not self.camera_service.picamera_available:
            print("[PiCam] Camera not available for recording")
            return

        duration = max(5, min(120, duration))
        self.recording_state.update({"is_recording": True, "duration": duration, "start_time": time.time()})
        threading.Thread(target=self._record_video, args=(duration,), daemon=True).start()
        print(f"[PiCam] Recording started: {duration}s")
        self._add_notification(f"Recording started: {duration}s video", "recording")
        threading.Thread(
            target=self.notification_service.send_push_notification_sync,
            args=(
                "Recording Started",
                f"Recording {duration}s video...",
                {"type": "recording_started", "duration": duration},
            ),
            daemon=True,
        ).start()

    def _record_video(self, duration: int) -> None:
        original_motion_state = self.motion_service.motion_enabled
        self.motion_service.motion_enabled = False
        time.sleep(1.0)
        try:
            final_path = self.camera_service.record_video(duration, self.media_dir)
            if final_path is None:
                return

            if self.azure_service.is_configured and final_path.suffix == ".mp4":
                try:
                    blob_name = f"recordings/{final_path.name}"
                    self.azure_service.upload_path(final_path, blob_name=blob_name)
                    print(f"Uploaded to Azure: {blob_name}")
                except Exception as upload_err:
                    print(f"Azure upload error: {upload_err}")
            elif self.azure_service.is_configured:
                print("Skipping Azure upload for non-mp4 recording")

            if final_path.suffix == ".mp4":
                self._add_notification(f"Recording ready: {final_path.name}", "recording")
                threading.Thread(
                    target=self.notification_service.send_push_notification_sync,
                    args=(
                        "Recording Ready",
                        f"Recording ready: {final_path.name}",
                        {"type": "recording_ready", "filename": final_path.name},
                    ),
                    daemon=True,
                ).start()
        except Exception as exc:
            print(f"Recording error: {exc}")
            import traceback

            traceback.print_exc()
        finally:
            self.motion_service.motion_enabled = original_motion_state
            self.recording_state.update({"is_recording": False, "duration": 0, "start_time": None})
