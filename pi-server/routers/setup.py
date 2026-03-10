from fastapi import APIRouter
from fastapi.responses import JSONResponse

from models import WiFiCredentials
from services.setup_service import is_configured, scan_networks, save_wifi_and_reboot, factory_reset


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

    @router.post("/setup/reset")
    async def setup_reset():
        """Trigger a factory reset — deletes WiFi config and reboots into AP setup mode."""
        factory_reset()
        return JSONResponse({"status": "ok", "message": "Factory reset triggered. Rebooting into setup mode..."})

    return router
