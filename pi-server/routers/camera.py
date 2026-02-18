from fastapi import APIRouter
import inspect
from starlette.concurrency import run_in_threadpool

from models import RecordRequest


async def _invoke(handler, *args, **kwargs):
    if inspect.iscoroutinefunction(handler):
        return await handler(*args, **kwargs)
    return await run_in_threadpool(handler, *args, **kwargs)


def create_camera_router(
    health_fn,
    stream_fn,
    stop_stream_fn,
    photo_fn,
    record_start_fn,
    rtc_status_fn=None,
    rtc_sync_fn=None,
) -> APIRouter:
    router = APIRouter(tags=["camera"])

    @router.get("/health")
    async def health():
        return await _invoke(health_fn)

    @router.get("/stream")
    async def stream():
        return await _invoke(stream_fn)

    @router.post("/stream/stop")
    async def stop_stream():
        return await _invoke(stop_stream_fn)

    @router.post("/photo")
    async def photo():
        return await _invoke(photo_fn)

    if rtc_status_fn is not None:
        @router.get("/rtc/status")
        async def rtc_status():
            return await _invoke(rtc_status_fn)

    if rtc_sync_fn is not None:
        @router.post("/rtc/sync")
        async def rtc_sync():
            return await _invoke(rtc_sync_fn)

    @router.post("/record/start")
    async def start_recording(req: RecordRequest):
        return await _invoke(record_start_fn, req)

    return router
