"""Tests for push notification endpoints:
GET /notifications, POST /notifications/register, POST /notifications/unregister
"""
from fastapi.testclient import TestClient


def test_get_notifications_returns_list(notifications_client: TestClient):
    resp = notifications_client.get("/notifications")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_notifications_initially_empty(notifications_client: TestClient):
    assert notifications_client.get("/notifications").json() == []


def test_register_push_token(notifications_client: TestClient):
    resp = notifications_client.post(
        "/notifications/register",
        json={"token": "ExponentPushToken[test-abc123]"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "registered"
    assert data["token"] == "ExponentPushToken[test-abc123]"


def test_unregister_push_token(notifications_client: TestClient):
    resp = notifications_client.post(
        "/notifications/unregister",
        json={"token": "ExponentPushToken[test-abc123]"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "unregistered"
    assert data["token"] == "ExponentPushToken[test-abc123]"


def test_register_missing_token_field(notifications_client: TestClient):
    """Missing token field should fail Pydantic validation."""
    resp = notifications_client.post("/notifications/register", json={})
    assert resp.status_code == 422


def test_unregister_missing_token_field(notifications_client: TestClient):
    resp = notifications_client.post("/notifications/unregister", json={})
    assert resp.status_code == 422


def test_register_calls_service(notifications_client: TestClient, monkeypatch):
    """register_token on the service is invoked with the correct token value."""
    # The fixture already has a MagicMock service; track calls via a list.
    calls = []

    # Re-wire the client with a fresh service that records calls.
    from unittest.mock import MagicMock
    from fastapi import FastAPI
    from routers import create_notifications_router

    svc = MagicMock()
    svc.get_notifications.return_value = []
    svc.register_token.side_effect = lambda t: calls.append(t)

    app = FastAPI()
    app.include_router(create_notifications_router(svc))
    from fastapi.testclient import TestClient as _TC
    client = _TC(app)

    client.post("/notifications/register", json={"token": "my-token"})
    assert calls == ["my-token"]
