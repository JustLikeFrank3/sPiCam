from pathlib import Path
from typing import Callable

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse


def create_events_router(media_dir: Path, list_recordings_fn: Callable[[], list[Path]]) -> APIRouter:
    router = APIRouter(tags=["events"])

    @router.get("/events")
    async def events():
        photos = sorted(media_dir.glob("photo_*.jpg"), reverse=True)
        motion = sorted(media_dir.glob("motion_*.jpg"), reverse=True)
        clips = sorted(media_dir.glob("motion_*.avi"), reverse=True)
        recordings = list_recordings_fn()
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

    @router.get("/recordings")
    async def recordings():
        items = list_recordings_fn()
        payload = [
            {
                "filename": p.name,
                "path": str(p),
                "timestamp": p.stat().st_mtime,
            }
            for p in items
        ]
        return JSONResponse(payload)

    @router.get("/media/{filename}")
    async def get_media(filename: str):
        file_path = media_dir / filename
        if not file_path.exists():
            return JSONResponse({"error": "Not found"}, status_code=404)
        return FileResponse(str(file_path))

    return router
