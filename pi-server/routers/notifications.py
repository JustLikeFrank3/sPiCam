from fastapi import APIRouter
from fastapi.responses import JSONResponse

from models import PushTokenRequest
from services.notification_service import NotificationService


def create_notifications_router(notification_service: NotificationService) -> APIRouter:
    router = APIRouter(tags=["notifications"])

    @router.get("/notifications")
    async def notifications():
        return JSONResponse(notification_service.get_notifications())

    @router.post("/notifications/register")
    async def register_push_token(req: PushTokenRequest):
        notification_service.register_token(req.token)
        return {"status": "registered", "token": req.token}

    @router.post("/notifications/unregister")
    async def unregister_push_token(req: PushTokenRequest):
        notification_service.unregister_token(req.token)
        return {"status": "unregistered", "token": req.token}

    return router
