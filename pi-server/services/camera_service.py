import io
import shutil
import subprocess
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw

try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder, H264Encoder
    from picamera2.outputs import FileOutput
except Exception:  # pragma: no cover - handled at runtime on Pi
    Picamera2 = None  # type: ignore[assignment]
    MJPEGEncoder = None  # type: ignore[assignment]
    H264Encoder = None  # type: ignore[assignment]
    FileOutput = object  # type: ignore[assignment]


class CameraService:
    def __init__(
        self,
        picamera_available: bool,
        stream_stale_sec: float,
        stream_debounce_sec: float,
        stream_warmup_sec: float,
        is_recording: Callable[[], bool],
    ) -> None:
        self.picamera_available = picamera_available
        self.stream_stale_sec = stream_stale_sec
        self.stream_debounce_sec = stream_debounce_sec
        self.stream_warmup_sec = stream_warmup_sec
        self.is_recording = is_recording

        self.picam = None
        self.stream_active = False
        self.stream_stop_requested = False
        self.last_stream_start_ts = 0.0
        self.latest_stream_frame: Optional[np.ndarray] = None
        self.latest_stream_frame_ts = 0.0
        self.latest_stream_lock = threading.Lock()

    def placeholder_frame(self) -> bytes:
        img = Image.new("RGB", (640, 480), color=(20, 20, 20))
        draw = ImageDraw.Draw(img)
        draw.text((20, 20), "Pi Camera Placeholder", fill=(200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()

    def _update_latest_stream_frame(self, frame_bytes: bytes) -> None:
        now = time.time()
        if now - self.latest_stream_frame_ts < 0.2:
            return
        img = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return
        with self.latest_stream_lock:
            self.latest_stream_frame = img
            self.latest_stream_frame_ts = now

    def close_camera(self) -> None:
        if self.picam:
            try:
                self.picam.stop_recording()
            except Exception:
                pass
            try:
                self.picam.stop()
            except Exception:
                pass
            try:
                self.picam.close()
            except Exception:
                pass
        self.picam = None

    def init_camera(self) -> None:
        if not self.picamera_available or self.picam is not None or Picamera2 is None:
            return
        try:
            self.picam = Picamera2()
            config = self.picam.create_video_configuration(main={"size": (640, 480)})
            self.picam.configure(config)
            self.picam.start()
        except Exception as exc:
            print(f"Camera initialization error: {exc}")
            if self.picam:
                try:
                    self.picam.close()
                except Exception:
                    pass
            self.picam = None

    def get_frame_array(self) -> Optional[np.ndarray]:
        if self.stream_active:
            with self.latest_stream_lock:
                if self.latest_stream_frame is not None and (time.time() - self.latest_stream_frame_ts) <= 1.0:
                    return self.latest_stream_frame.copy()

        if self.picamera_available:
            self.init_camera()
            if self.picam is not None:
                try:
                    frame = self.picam.capture_array()
                    return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                except Exception as exc:
                    print(f"Frame capture error: {exc}")
                    return None

        placeholder = self.placeholder_frame()
        return cv2.imdecode(np.frombuffer(placeholder, np.uint8), cv2.IMREAD_COLOR)

    def capture_photo(self, output_path: Path) -> None:
        if self.picamera_available:
            self.init_camera()
            if self.picam is not None:
                self.picam.capture_file(str(output_path))
                return
            print("Photo endpoint: Camera not available, using placeholder")
        output_path.write_bytes(self.placeholder_frame())

    def create_recording_camera(self):
        if not self.picamera_available or Picamera2 is None:
            return None
        self.close_camera()
        time.sleep(0.5)
        self.picam = Picamera2()
        video_config = self.picam.create_video_configuration(main={"size": (1920, 1080), "format": "RGB888"})
        self.picam.configure(video_config)
        self.picam.start()
        return self.picam

    def record_video(self, duration: int, media_dir: Path) -> Optional[Path]:
        if not self.picamera_available or H264Encoder is None:
            print("Camera not available for recording")
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_path = media_dir / f"recording_{timestamp}.h264"
        mp4_path = video_path.with_suffix(".mp4")

        picam = self.create_recording_camera()
        if picam is None:
            print("Camera unavailable for recording session")
            return None

        try:
            encoder = H264Encoder()
            picam.start_recording(encoder, str(video_path))
            print(f"Recording started: {video_path}")
            time.sleep(duration)
            picam.stop_recording()
            picam.stop()
            try:
                picam.close()
            except Exception:
                pass
            print(f"Recording stopped: {video_path}")
        except Exception as exc:
            print(f"Recording capture error: {exc}")
            return None
        finally:
            self.picam = None

        if shutil.which("ffmpeg"):
            try:
                subprocess.run(
                    ["ffmpeg", "-i", str(video_path), "-c:v", "copy", str(mp4_path)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f"FFmpeg conversion successful: {mp4_path}")
                video_path.unlink()
                final_path = mp4_path
            except Exception as convert_err:
                print(f"FFmpeg conversion error: {convert_err}")
                final_path = video_path
        else:
            print("FFmpeg not found; keeping raw h264 recording")
            final_path = video_path

        if not final_path.exists():
            print(f"ERROR: Video file not found: {final_path}")
            return None

        print(f"Video saved successfully: {final_path}, size: {final_path.stat().st_size} bytes")
        return final_path

    def _ensure_stream_camera(self) -> bool:
        if self.picam is not None:
            return True
        if not self.picamera_available or Picamera2 is None:
            return False
        try:
            self.picam = Picamera2()
            config = self.picam.create_video_configuration(main={"size": (640, 480)})
            self.picam.configure(config)
            self.picam.start()
            return True
        except Exception as exc:
            print(f"Stream: Camera initialization failed: {exc}")
            self.picam = None
            return False

    def _ensure_stream_camera_with_retry(self, attempts: int = 3, base_delay: float = 0.5) -> bool:
        for attempt in range(attempts):
            if self._ensure_stream_camera():
                return True
            time.sleep(base_delay * (attempt + 1))
        return False

    def stream_response(self) -> StreamingResponse:
        boundary = "frame"

        def frame_generator():
            self.stream_active = False
            self.stream_stop_requested = False

            if time.time() - self.last_stream_start_ts < self.stream_debounce_sec:
                frame = self.placeholder_frame()
                yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                return

            if self.is_recording():
                while self.is_recording():
                    frame = self.placeholder_frame()
                    yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                    time.sleep(0.5)

            if self.picamera_available and MJPEGEncoder is not None:
                self.close_camera()
                time.sleep(0.5)

                if not self._ensure_stream_camera_with_retry():
                    for _ in range(100):
                        frame = self.placeholder_frame()
                        yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
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
                if not self._ensure_stream_camera_with_retry():
                    while True:
                        frame = self.placeholder_frame()
                        yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                        time.sleep(0.5)

                self.picam.start_recording(encoder, stream_output)
                self.stream_active = True
                self.last_stream_start_ts = time.time()
                try:
                    while True:
                        if self.stream_stop_requested:
                            break
                        if self.picam is None and not self._ensure_stream_camera_with_retry():
                            frame = self.placeholder_frame()
                            yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                            time.sleep(0.5)
                            continue

                        if self.is_recording():
                            if self.picam:
                                self.picam.stop_recording()
                            while self.is_recording():
                                frame = self.placeholder_frame()
                                yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                                time.sleep(0.5)
                            if not self._ensure_stream_camera_with_retry():
                                continue
                            self.picam.start_recording(encoder, stream_output)

                        frame = output.getvalue()
                        if frame:
                            self._update_latest_stream_frame(frame)
                            yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"

                        if self.latest_stream_frame_ts and (time.time() - self.last_stream_start_ts) > self.stream_warmup_sec:
                            if (time.time() - self.latest_stream_frame_ts) > self.stream_stale_sec:
                                print("Stream stale: closing camera to restore motion")
                                break
                        time.sleep(0.03)
                finally:
                    self.stream_active = False
                    self.stream_stop_requested = False
                    self.close_camera()
            else:
                while True:
                    frame = self.placeholder_frame()
                    yield (b"--%b\r\nContent-Type: image/jpeg\r\n\r\n" % boundary.encode()) + frame + b"\r\n"
                    time.sleep(0.1)

        return StreamingResponse(frame_generator(), media_type=f"multipart/x-mixed-replace; boundary={boundary}")

    def stop_stream(self) -> dict:
        self.stream_stop_requested = True
        self.stream_active = False
        self.close_camera()
        return {"status": "stopped"}
