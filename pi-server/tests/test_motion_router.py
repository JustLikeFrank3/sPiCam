"""Tests for motion detection endpoints:
/arm, /disarm, /status, /motion/settings, /motion/debug, /motion/metrics, /motion/test
"""
from fastapi.testclient import TestClient


def test_arm(motion_client: TestClient):
    resp = motion_client.post("/arm")
    assert resp.status_code == 200
    assert resp.json()["armed"] is True


def test_disarm(motion_client: TestClient):
    resp = motion_client.post("/disarm")
    assert resp.status_code == 200
    assert resp.json()["armed"] is False


def test_get_motion_settings_shape(motion_client: TestClient):
    resp = motion_client.get("/motion/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "threshold" in data
    assert "min_area" in data
    assert "cooldown" in data


def test_get_motion_settings_defaults(motion_client: TestClient):
    data = motion_client.get("/motion/settings").json()
    assert data["threshold"] == 25
    assert data["min_area"] == 500
    assert data["cooldown"] == 60


def test_update_motion_settings_threshold(motion_client: TestClient):
    resp = motion_client.post("/motion/settings", json={"threshold": 30})
    assert resp.status_code == 200
    assert resp.json()["threshold"] == 30


def test_update_motion_settings_partial(motion_client: TestClient):
    """Partial update (only cooldown) should succeed."""
    resp = motion_client.post("/motion/settings", json={"cooldown": 120})
    assert resp.status_code == 200
    assert resp.json()["cooldown"] == 120


def test_update_motion_settings_invalid_type(motion_client: TestClient):
    """String where int is expected should return 422."""
    resp = motion_client.post("/motion/settings", json={"threshold": "high"})
    assert resp.status_code == 422


def test_status_shape(motion_client: TestClient):
    resp = motion_client.get("/status")
    assert resp.status_code == 200
    assert "armed" in resp.json()


def test_motion_debug(motion_client: TestClient):
    resp = motion_client.get("/motion/debug")
    assert resp.status_code == 200


def test_motion_metrics_shape(motion_client: TestClient):
    resp = motion_client.get("/motion/metrics")
    assert resp.status_code == 200
    assert "events" in resp.json()


def test_motion_test_triggered(motion_client: TestClient):
    resp = motion_client.post("/motion/test")
    assert resp.status_code == 200
    assert resp.json()["triggered"] is True
