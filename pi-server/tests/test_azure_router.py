"""Tests for Azure Blob Storage endpoints:
GET /azure/blobs, GET /azure/media/<blob_name>
"""
from fastapi.testclient import TestClient


# ── Unconfigured ──────────────────────────────────────────────────────────────

def test_list_blobs_unconfigured(azure_client_unconfigured: TestClient):
    resp = azure_client_unconfigured.get("/azure/blobs")
    assert resp.status_code == 400
    assert "Azure not configured" in resp.json()["error"]


def test_get_media_unconfigured(azure_client_unconfigured: TestClient):
    resp = azure_client_unconfigured.get("/azure/media/some-blob.jpg")
    assert resp.status_code == 400
    assert "Azure not configured" in resp.json()["error"]


# ── Configured ────────────────────────────────────────────────────────────────

def test_list_blobs_returns_list(azure_client_configured: TestClient):
    resp = azure_client_configured.get("/azure/blobs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_blobs_default_limit(azure_client_configured: TestClient):
    resp = azure_client_configured.get("/azure/blobs")
    assert resp.status_code == 200
    blobs = resp.json()
    assert len(blobs) == 1
    assert blobs[0]["name"] == "photo_001.jpg"


def test_list_blobs_custom_limit(azure_client_configured: TestClient):
    """limit query param is accepted without error."""
    resp = azure_client_configured.get("/azure/blobs?limit=5")
    assert resp.status_code == 200


def test_list_blobs_error_propagated(monkeypatch):
    """Azure SDK exception surfaces as a 500 with error detail."""
    import routers.azure as azure_module
    from unittest.mock import MagicMock
    from fastapi import FastAPI
    from routers import azure_router as _router

    mock_svc = MagicMock()
    mock_svc.is_configured = True
    mock_svc.list_blobs.side_effect = RuntimeError("connection refused")
    monkeypatch.setattr(azure_module, "azure_service", mock_svc)

    app = FastAPI()
    app.include_router(_router)
    client = TestClient(app)

    resp = client.get("/azure/blobs")
    assert resp.status_code == 500
    assert "error" in resp.json()
