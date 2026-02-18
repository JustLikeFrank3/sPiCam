"""Tests for media/event listing endpoints: /events, /recordings, /media/<filename>."""
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import create_events_router


def test_events_empty(events_client: TestClient):
    resp = events_client.get("/events")
    assert resp.status_code == 200
    assert resp.json() == []


def test_recordings_empty(events_client: TestClient):
    resp = events_client.get("/recordings")
    assert resp.status_code == 200
    assert resp.json() == []


def test_events_includes_photos_and_motion(tmp_media: Path):
    (tmp_media / "photo_001.jpg").write_bytes(b"fake-jpg")
    (tmp_media / "motion_002.jpg").write_bytes(b"fake-motion-jpg")

    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: []))
    client = TestClient(app)

    resp = client.get("/events")
    assert resp.status_code == 200
    names = [item["filename"] for item in resp.json()]
    assert "photo_001.jpg" in names
    assert "motion_002.jpg" in names


def test_events_sorted_by_timestamp_descending(tmp_media: Path):
    """Latest file should appear first in the events list."""
    import time

    older = tmp_media / "photo_older.jpg"
    older.write_bytes(b"old")
    time.sleep(0.05)
    newer = tmp_media / "photo_newer.jpg"
    newer.write_bytes(b"new")

    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: []))
    client = TestClient(app)

    items = client.get("/events").json()
    names = [item["filename"] for item in items]
    assert names.index("photo_newer.jpg") < names.index("photo_older.jpg")


def test_events_payload_fields(tmp_media: Path):
    (tmp_media / "photo_001.jpg").write_bytes(b"x")

    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: []))
    item = TestClient(app).get("/events").json()[0]

    assert "filename" in item
    assert "path" in item
    assert "timestamp" in item


def test_media_not_found(events_client: TestClient):
    resp = events_client.get("/media/nonexistent.jpg")
    assert resp.status_code == 404


def test_media_found(tmp_media: Path):
    img = tmp_media / "photo_test.jpg"
    img.write_bytes(b"\xff\xd8\xff")  # minimal JPEG header

    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: []))
    client = TestClient(app)

    resp = client.get("/media/photo_test.jpg")
    assert resp.status_code == 200


def test_recordings_includes_injected_files(tmp_media: Path):
    """list_recordings_fn results appear in /recordings."""
    clip = tmp_media / "recording_001.mp4"
    clip.write_bytes(b"fake-mp4")

    app = FastAPI()
    app.include_router(create_events_router(tmp_media, list_recordings_fn=lambda: [clip]))
    client = TestClient(app)

    names = [item["filename"] for item in client.get("/recordings").json()]
    assert "recording_001.mp4" in names
