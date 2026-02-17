from .azure import router as azure_router
from .camera import create_camera_router
from .events import create_events_router
from .motion import create_motion_router
from .notifications import create_notifications_router

__all__ = ["azure_router", "create_camera_router", "create_events_router", "create_notifications_router", "create_motion_router"]
