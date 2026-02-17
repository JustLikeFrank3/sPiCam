import threading
import time
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np


class MotionService:
    def __init__(
        self,
        get_frame_array: Callable[[], Optional[np.ndarray]],
        send_push_notification_sync: Callable[[str, str, dict], None],
        add_notification: Callable[[str, str], None],
        threshold: int,
        min_area: int,
        cooldown: int,
        warmup_sec: float,
    ) -> None:
        self.get_frame_array = get_frame_array
        self.send_push_notification_sync = send_push_notification_sync
        self.add_notification = add_notification

        self.threshold = threshold
        self.min_area = min_area
        self.cooldown = cooldown
        self.warmup_sec = warmup_sec

        self.motion_enabled = True
        self.last_motion_ts: Optional[float] = None
        self.last_notification_time: Optional[float] = None
        self.background_frame: Optional[np.ndarray] = None
        self.motion_thread: Optional[threading.Thread] = None
        self.motion_enabled_since: Optional[float] = None
        self.motion_lock = threading.Lock()
        self.motion_event_active = False
        self.quiet_frame_count = 0
        self.quiet_frames_to_rearm = 10

        self.motion_metrics = {
            "last_delta_mean": None,
            "last_delta_max": None,
            "last_contour_area": None,
            "last_contour_count": None,
            "last_frame_ts": None,
        }

    def arm(self) -> dict:
        self.motion_enabled = True
        self.background_frame = None
        self.motion_enabled_since = time.time()
        self.motion_event_active = False
        self.quiet_frame_count = 0
        return {"motion_enabled": self.motion_enabled}

    def disarm(self) -> dict:
        self.motion_enabled = False
        self.motion_enabled_since = None
        self.motion_event_active = False
        self.quiet_frame_count = 0
        return {"motion_enabled": self.motion_enabled}

    def get_settings(self) -> dict:
        return {
            "threshold": self.threshold,
            "min_area": self.min_area,
            "cooldown": self.cooldown,
        }

    def update_settings(
        self,
        threshold: Optional[int],
        min_area: Optional[int],
        cooldown: Optional[int],
        env_file: Path,
    ) -> dict:
        if threshold is not None:
            self.threshold = max(1, min(50, threshold))
        if min_area is not None:
            self.min_area = max(5, min(1000, min_area))
        if cooldown is not None:
            self.cooldown = max(5, min(300, cooldown))

        env_lines = []
        if env_file.exists():
            env_lines = env_file.read_text().splitlines()

        settings_map = {
            "MOTION_THRESHOLD": str(self.threshold),
            "MOTION_MIN_AREA": str(self.min_area),
            "NOTIFICATION_COOLDOWN": str(self.cooldown),
        }

        for key, value in settings_map.items():
            found = False
            for index, line in enumerate(env_lines):
                if line.startswith(f"{key}="):
                    env_lines[index] = f"{key}={value}"
                    found = True
                    break
            if not found:
                env_lines.append(f"{key}={value}")

        env_file.write_text("\n".join(env_lines) + "\n")

        return {
            "threshold": self.threshold,
            "min_area": self.min_area,
            "cooldown": self.cooldown,
            "updated": True,
        }

    def status(self) -> dict:
        return {
            "motion_enabled": self.motion_enabled,
            "last_motion": self.last_motion_ts,
        }

    def debug(self, stream_active: bool, latest_stream_frame_ts: float, token_count: int) -> dict:
        return {
            "motion_enabled": self.motion_enabled,
            "last_motion": self.last_motion_ts,
            "last_notification_time": self.last_notification_time,
            "motion_event_active": self.motion_event_active,
            "quiet_frame_count": self.quiet_frame_count,
            "background_frame_set": self.background_frame is not None,
            "stream_active": stream_active,
            "latest_stream_frame_age_sec": round(time.time() - latest_stream_frame_ts, 2)
            if latest_stream_frame_ts
            else None,
            "push_tokens": token_count,
        }

    def metrics(self) -> dict:
        return {
            **self.motion_metrics,
            "motion_enabled": self.motion_enabled,
            "background_frame_set": self.background_frame is not None,
        }

    def run_motion_test(self) -> dict:
        self.last_notification_time = time.time()
        threading.Thread(
            target=self.send_push_notification_sync,
            args=(
                "Motion Test",
                "sPiCam test notification. This confirms push delivery.",
                {"type": "motion_test"},
            ),
            daemon=True,
        ).start()
        self.add_notification("Motion test - notification sent", "motion")
        return {"status": "sent"}

    def loop(self) -> None:
        while True:
            if not self.motion_enabled:
                time.sleep(0.5)
                continue

            frame = self.get_frame_array()
            if frame is None:
                time.sleep(0.5)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if self.motion_enabled_since and (time.time() - self.motion_enabled_since) < self.warmup_sec:
                self.background_frame = gray
                time.sleep(0.1)
                continue

            if self.background_frame is None:
                self.background_frame = gray
                time.sleep(0.1)
                continue

            delta = cv2.absdiff(self.background_frame, gray)
            self.motion_metrics["last_delta_mean"] = float(delta.mean())
            self.motion_metrics["last_delta_max"] = float(delta.max())
            thresh = cv2.threshold(delta, self.threshold, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            self.motion_metrics["last_contour_count"] = len(contours)
            self.motion_metrics["last_contour_area"] = max((cv2.contourArea(contour) for contour in contours), default=0.0)
            self.motion_metrics["last_frame_ts"] = time.time()

            motion_detected = any(cv2.contourArea(contour) >= self.min_area for contour in contours)

            if motion_detected:
                self.last_motion_ts = time.time()
                self.quiet_frame_count = 0

                if not self.motion_event_active:
                    current_time = time.time()
                    if self.last_notification_time is None or (current_time - self.last_notification_time) >= self.cooldown:
                        threading.Thread(
                            target=self.send_push_notification_sync,
                            args=(
                                "Motion Detected",
                                "sPiCam detected motion. Tap to start recording.",
                                {"type": "motion_detected"},
                            ),
                            daemon=True,
                        ).start()
                        self.last_notification_time = current_time
                        self.add_notification("Motion detected - notification sent", "motion")
                self.motion_event_active = True
            else:
                self.quiet_frame_count += 1
                if self.quiet_frame_count >= self.quiet_frames_to_rearm:
                    self.motion_event_active = False

            self.background_frame = gray
            time.sleep(0.2)

    def start_thread(self) -> None:
        if self.motion_thread and self.motion_thread.is_alive():
            return
        self.motion_thread = threading.Thread(target=self.loop, daemon=True)
        self.motion_thread.start()
