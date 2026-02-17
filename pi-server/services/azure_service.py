from pathlib import Path
from typing import Optional, Tuple

from azure.storage.blob import BlobServiceClient, ContentSettings

from config import settings


class AzureService:
    def __init__(self) -> None:
        self.connection_string = settings.azure_connection_string
        self.container_name = settings.azure_container
        self.blob_service: Optional[BlobServiceClient] = None
        self.container_client = None

        if self.connection_string:
            self.blob_service = BlobServiceClient.from_connection_string(self.connection_string)
            self.container_client = self.blob_service.get_container_client(self.container_name)

    @property
    def is_configured(self) -> bool:
        return self.container_client is not None

    @staticmethod
    def _detect_content_type(name: str) -> str:
        lower = name.lower()
        if lower.endswith((".jpg", ".jpeg")):
            return "image/jpeg"
        if lower.endswith(".mp4"):
            return "video/mp4"
        if lower.endswith(".avi"):
            return "video/x-msvideo"
        return "application/octet-stream"

    def upload_path(self, path: Path, blob_name: Optional[str] = None) -> None:
        if not self.is_configured:
            raise RuntimeError("Azure not configured")

        target_name = blob_name or path.name
        content_type = self._detect_content_type(target_name)

        with open(path, "rb") as handle:
            self.container_client.upload_blob(
                name=target_name,
                data=handle,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )

    def list_blobs(self, limit: int = 10000) -> list[dict]:
        if not self.is_configured:
            raise RuntimeError("Azure not configured")

        blobs = []
        for blob in self.container_client.list_blobs():
            blobs.append(
                {
                    "name": blob.name,
                    "size": blob.size,
                    "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
                }
            )
            if len(blobs) >= max(1, limit):
                break

        blobs.sort(key=lambda item: item.get("last_modified") or "", reverse=True)
        return blobs

    def get_blob_stream(
        self, blob_name: str, range_header: Optional[str]
    ) -> Tuple[object, str, int, dict]:
        if not self.is_configured:
            raise RuntimeError("Azure not configured")

        blob_client = self.container_client.get_blob_client(blob_name)
        props = blob_client.get_blob_properties()
        file_size = props.size
        content_type = self._detect_content_type(blob_name)

        if range_header:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            length = end - start + 1
            download = blob_client.download_blob(offset=start, length=length)
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            }
            return download.chunks(), content_type, 206, headers

        download = blob_client.download_blob()
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return download.chunks(), content_type, 200, headers


azure_service = AzureService()
