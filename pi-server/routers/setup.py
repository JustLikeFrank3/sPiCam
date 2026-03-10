from fastapi import APIRouter
from fastapi.responses import JSONResponse

from models import WiFiCredentials
from services.setup_service import is_configured, scan_networks, save_wifi_and_reboot


def create_setup_router() -> APIRouter:
    router = APIRouter(tags=["setup"])

    @router.get("/setup/status")
    async def setup_status():
        return {"configured": is_configured()}

    @router.get("/setup/networks")
    async def setup_networks():
        networks = scan_networks()
        return {"networks": networks}

    @router.post("/setup/wifi")
    async def setup_wifi(creds: WiFiCredentials):
        save_wifi_and_reboot(creds.ssid, creds.password)
        return JSONResponse({"status": "ok", "message": "Credentials saved. Rebooting now..."})

    return router
