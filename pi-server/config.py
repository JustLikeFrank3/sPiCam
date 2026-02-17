from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


@dataclass
class Settings:
	base_dir: Path = BASE_DIR
	media_dir: Path = BASE_DIR / "media"
	push_tokens_file: Path = BASE_DIR / "push_tokens.json"

	azure_connection_string: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
	azure_container: str = os.getenv("AZURE_STORAGE_CONTAINER", "images")

	notification_cooldown: int = int(os.getenv("NOTIFICATION_COOLDOWN", "60"))

	motion_threshold: int = int(os.getenv("MOTION_THRESHOLD", "25"))
	motion_min_area: int = int(os.getenv("MOTION_MIN_AREA", "500"))
	motion_warmup_sec: float = float(os.getenv("MOTION_WARMUP_SEC", "3"))
	motion_save_clips: bool = os.getenv("MOTION_SAVE_CLIPS", "0") == "1"

	stream_stale_sec: float = float(os.getenv("STREAM_STALE_SEC", "30"))
	stream_debounce_sec: float = float(os.getenv("STREAM_DEBOUNCE_SEC", "5"))
	stream_warmup_sec: float = float(os.getenv("STREAM_WARMUP_SEC", "10"))

	rtc_enabled: bool = os.getenv("RTC_ENABLED", "0") == "1"
	shutter_button_enabled: bool = os.getenv("SHUTTER_BUTTON_ENABLED", "1") == "1"
	shutter_button_gpio: int = int(os.getenv("SHUTTER_BUTTON_GPIO", "17"))
	media_retention_days: int = int(os.getenv("MEDIA_RETENTION_DAYS", "7"))


settings = Settings()