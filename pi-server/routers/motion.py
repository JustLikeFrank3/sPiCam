from fastapi import APIRouter
import inspect

from models import MotionSettings


async def _invoke(handler, *args, **kwargs):
    result = handler(*args, **kwargs)
    if inspect.isawaitable(result):
        return await result
    return result


def create_motion_router(
    arm_fn,
    disarm_fn,
    get_motion_settings_fn,
    update_motion_settings_fn,
    status_fn,
    motion_debug_fn,
    motion_metrics_fn,
    motion_test_fn,
) -> APIRouter:
    router = APIRouter(tags=["motion"])

    @router.post("/arm")
    async def arm_motion():
        return await _invoke(arm_fn)

    @router.post("/disarm")
    async def disarm_motion():
        return await _invoke(disarm_fn)

    @router.get("/motion/settings")
    async def get_motion_settings():
        return await _invoke(get_motion_settings_fn)

    @router.post("/motion/settings")
    async def update_motion_settings(settings: MotionSettings):
        return await _invoke(update_motion_settings_fn, settings)

    @router.get("/status")
    async def status():
        return await _invoke(status_fn)

    @router.get("/motion/debug")
    async def motion_debug():
        return await _invoke(motion_debug_fn)

    @router.get("/motion/metrics")
    async def motion_metrics_endpoint():
        return await _invoke(motion_metrics_fn)

    @router.post("/motion/test")
    async def motion_test():
        return await _invoke(motion_test_fn)

    return router
