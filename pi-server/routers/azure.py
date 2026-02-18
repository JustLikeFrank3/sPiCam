from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from services import azure_service


router = APIRouter(tags=["azure"])


@router.get("/azure/blobs")
async def list_azure_blobs(limit: int = 10000):
    if not azure_service.is_configured:
        return JSONResponse({"error": "Azure not configured"}, status_code=400)
    try:
        blobs = await run_in_threadpool(azure_service.list_blobs, limit)
        return JSONResponse(blobs)
    except Exception as exc:
        return JSONResponse({"error": f"Azure list failed: {exc}"}, status_code=500)


@router.get("/azure/media/{blob_name:path}")
async def get_azure_media(blob_name: str, request: Request):
    if not azure_service.is_configured:
        return JSONResponse({"error": "Azure not configured"}, status_code=400)

    try:
        chunks, media_type, status_code, headers = await run_in_threadpool(
            azure_service.get_blob_stream,
            blob_name,
            request.headers.get("range"),
        )
        return StreamingResponse(
            chunks,
            media_type=media_type,
            status_code=status_code,
            headers=headers,
        )
    except Exception as exc:
        return JSONResponse({"error": f"Azure fetch failed: {exc}"}, status_code=500)
