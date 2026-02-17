from pathlib import Path
import time


def clamp(value: float, minimum: int, maximum: int) -> float:
    return max(minimum, min(maximum, value))


def cleanup_old_media(media_dir: Path, retention_days: int) -> None:
    if retention_days <= 0:
        return

    try:
        cutoff_time = time.time() - (retention_days * 86400)
        deleted_count = 0

        for file_path in media_dir.glob("*"):
            if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
                try:
                    file_path.unlink()
                    deleted_count += 1
                    print(f"[PiCam] Cleanup: deleted old file {file_path.name}")
                except Exception as exc:
                    print(f"[PiCam] Cleanup: failed to delete {file_path.name}: {exc}")

        if deleted_count > 0:
            print(f"[PiCam] Cleanup: removed {deleted_count} file(s) older than {retention_days} days")
    except Exception as exc:
        print(f"[PiCam] Cleanup failed: {exc}")
