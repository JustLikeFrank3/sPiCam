"""Tests for camera endpoints: /health, /stream, /stream/stop, /photo, /record/start."""
from fastapi.testclient import TestClient


def test_health_returns_ok(camera_client: TestClient):
    resp = camera_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_stream_returns_status(camera_client: TestClient):
    resp = camera_client.get("/stream")
    assert resp.status_code == 200
    assert "status" in resp.json()


def test_stop_stream(camera_client: TestClient):
    resp = camera_client.post("/stream/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


def test_photo_endpoint(camera_client: TestClient):
    resp = camera_client.post("/photo")
    assert resp.status_code == 200
    assert "filename" in resp.json()


def test_record_start_default_duration(camera_client: TestClient):
    resp = camera_client.post("/record/start", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "recording"


def test_record_start_custom_duration(camera_client: TestClient):
    resp = camera_client.post("/record/start", json={"duration": 60})
    assert resp.status_code == 200


def test_record_start_invalid_body(camera_client: TestClient):
    """Non-integer duration should fail Pydantic validation."""
    resp = camera_client.post("/record/start", json={"duration": "not-a-number"})
    assert resp.status_code == 422
