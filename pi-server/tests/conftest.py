"""Shared pytest fixtures for pi-server API tests.

Pi-only and hardware modules are replaced with stubs before any server code is
imported, so the full test suite can run on any machine or in CI without a
Raspberry Pi.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock

# ── Add pi-server root to sys.path ────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Stub out hardware / Pi-only packages ──────────────────────────────────────
_PI_STUBS = [
    "picamera2",
    "picamera2.controls",
    "RPi",
    "RPi.GPIO",
    "adafruit_ds3231",
    "adafruit_blinka",
    "board",
    "busio",
    "smbus2",
]
for _mod in _PI_STUBS:
    sys.modules.setdefault(_mod, MagicMock())

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import (
    azure_router,
    create_camera_router,
    create_events_router,
    create_motion_router,
    create_notifications_router,
)


# ── Helper ─────────────────────────────────────────────────────────────────────

def _handler(return_value):
    """Return a plain sync callable that always returns *return_value*."""
    def _fn(*args, **kwargs):
        return return_value
    return _fn


# ── Shared fixtures ────────────────────────────────────────────────────────────

@pytest.fixture()
def tmp_media(tmp_path: Path) -> Path:
    """Empty temporary directory used as the media dir in tests."""
    return tmp_path


@pytest.fixture()
def camera_client() -> TestClient:
    app = FastAPI()
    app.include_router(
        create_camera_router(
            health_fn=_handler({"status": "ok", "camera": "mock"}),
            stream_fn=_handler({"status": "streaming"}),
            stop_stream_fn=_handler({"status": "stopped"}),
            photo_fn=_handler({"filename": "photo_test.jpg"}),
            record_start_fn=_handler({"status": "recording", "duration": 30}),
        )
    )
    return TestClient(app)


@pytest.fixture()
def motion_client() -> TestClient:
    def _update_settings(settings):
        return {
            "threshold": settings.threshold if settings.threshold is not None else 25,
            "min_area": settings.min_area if settings.min_area is not None else 500,
            "cooldown": settings.cooldown if settings.cooldown is not None else 60,
        }

    app = FastAPI()
    app.include_router(
        create_motion_router(
            arm_fn=_handler({"armed": True}),
            disarm_fn=_handler({"armed": False}),
            get_motion_settings_fn=_handler({"threshold": 25, "min_area": 500, "cooldown": 60}),
            update_motion_settings_fn=_update_settings,
            status_fn=_handler({"armed": False, "motion_detected": False}),
            motion_debug_fn=_handler({"frame_count": 0, "last_frame_ts": None}),
            motion_metrics_fn=_handler({"events": 0, "false_positives": 0}),
            motion_test_fn=_handler({"triggered": True}),
        )
    )
    return TestClient(app)


@pytest.fixture()
def events_client(tmp_media: Path) -> TestClient:
    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: []))
    return TestClient(app)


@pytest.fixture()
def notifications_client() -> TestClient:
    svc = MagicMock()
    svc.get_notifications.return_value = []
    svc.register_token.return_value = None
    svc.unregister_token.return_value = None

    app = FastAPI()
    app.include_router(create_notifications_router(svc))
    return TestClient(app)


@pytest.fixture()
def azure_client_unconfigured(monkeypatch) -> TestClient:
    """Azure client where azure_service reports it is NOT configured."""
    import routers.azure as azure_module

    mock_svc = MagicMock()
    mock_svc.is_configured = False
    monkeypatch.setattr(azure_module, "azure_service", mock_svc)

    app = FastAPI()
    app.include_router(azure_router)
    return TestClient(app)


@pytest.fixture()
def azure_client_configured(monkeypatch) -> TestClient:
    """Azure client where azure_service is configured and returns blob data."""
    import routers.azure as azure_module

    mock_svc = MagicMock()
    mock_svc.is_configured = True
    mock_svc.list_blobs.return_value = [
        {"name": "photo_001.jpg", "size": 1234, "last_modified": "2026-01-01T00:00:00Z"}
    ]
    monkeypatch.setattr(azure_module, "azure_service", mock_svc)

    app = FastAPI()
    app.include_router(azure_router)
    return TestClient(app)
