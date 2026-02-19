# Backend Refactoring Instructions for Codex

## Objective
Refactor `pi-server/main.py` (1280 lines) into a clean, modular architecture with separation of concerns.

## Current State
- **Branch**: `refactor/backend`
- **Directories created**: `routers/`, `services/`, `models/`, `utils/`
- **Work started**: Empty `config.py` file created

## Architecture Target

```
pi-server/
├── main.py                  # FastAPI app setup, middleware, startup (~150 lines)
├── config.py                # Configuration management (~100 lines)
├── routers/                 # API endpoints
│   ├── __init__.py
│   ├── camera.py           # /camera, /preview, /stream, /snapshot
│   ├── motion.py           # /motion endpoints
│   ├── azure.py            # /azure endpoints
│   └── events.py           # /events endpoints
├── services/                # Business logic
│   ├── __init__.py
│   ├── camera_service.py   # PiCamera2 management
│   ├── motion_service.py   # Motion detection logic
│   ├── azure_service.py    # Azure blob operations
│   └── notification_service.py
├── models/
│   ├── __init__.py
│   └── schemas.py          # Pydantic models
└── utils/
    ├── __init__.py
    └── helpers.py          # Shared utilities
```

## Phase 1: Configuration Management

### File: `pi-server/config.py`
**Task**: Extract all configuration and environment variables from main.py

**Include**:
- All `os.getenv()` calls
- Path definitions (BASE_DIR, MEDIA_DIR)
- Azure connection setup
- Hardware feature flags (RTC_ENABLED, SHUTTER_BUTTON_ENABLED, etc.)
- Motion detection parameters
- Stream parameters
- Notification settings

**Create config class or use dataclass**:
```python
from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

@dataclass
class Config:
    # Paths
    base_dir: Path = BASE_DIR
    media_dir: Path = BASE_DIR / "media"
    
    # Azure
    azure_connection_string: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    azure_container: str = os.getenv("AZURE_STORAGE_CONTAINER", "images")
    
    # Motion Detection
    motion_threshold: int = int(os.getenv("MOTION_THRESHOLD", "25"))
    motion_min_area: int = int(os.getenv("MOTION_MIN_AREA", "500"))
    # ... etc
    
config = Config()
```

## Phase 2: Pydantic Models

### File: `pi-server/models/schemas.py`
**Task**: Extract all Pydantic models and request/response schemas

**Extract from main.py**:
- `RecordRequest`
- `PushTokenRequest`
- Any other BaseModel classes

**Add response models** for better API documentation:
```python
from pydantic import BaseModel
from typing import Optional

class RecordRequest(BaseModel):
    duration: int = 30

class PushTokenRequest(BaseModel):
    token: str

class MotionMetricsResponse(BaseModel):
    last_delta_mean: Optional[float]
    last_delta_max: Optional[float]
    last_contour_area: Optional[int]
    last_contour_count: Optional[int]
    last_frame_ts: Optional[float]

class EventResponse(BaseModel):
    filename: str
    path: str
    timestamp: str
```

### File: `pi-server/models/__init__.py`
```python
from .schemas import *
```

## Phase 3: Azure Service

### File: `pi-server/services/azure_service.py`
**Task**: Extract all Azure Blob Storage operations

**Class**: `AzureService`

**Methods to extract**:
- `_upload_blob()` function → `upload_blob()`
- Azure connection setup
- Container client management
- Blob listing logic from `/azure/blobs` endpoint
- Blob download logic from `/azure/media/{blob_name}` endpoint

**Include**:
- Content-Type detection
- Range request handling
- Blob metadata management

**Example structure**:
```python
from azure.storage.blob import BlobServiceClient, ContentSettings
from typing import Optional, List, Dict
from ..config import config

class AzureService:
    def __init__(self):
        self.connection_string = config.azure_connection_string
        self.container_name = config.azure_container
        self.blob_service = None
        self.container_client = None
        
        if self.connection_string:
            self._init_clients()
    
    def _init_clients(self):
        """Initialize Azure clients"""
        ...
    
    def upload_blob(self, blob_name: str, file_path: Path) -> bool:
        """Upload file to Azure blob storage"""
        ...
    
    def list_blobs(self, prefix: str = "recordings/", max_results: int = 10000) -> List[Dict]:
        """List blobs with metadata"""
        ...
    
    def download_blob(self, blob_name: str, start: Optional[int] = None, length: Optional[int] = None):
        """Download blob or range"""
        ...
```

### File: `pi-server/services/__init__.py`
```python
from .azure_service import AzureService
from .camera_service import CameraService
from .motion_service import MotionService
from .notification_service import NotificationService
```

## Phase 4: Camera Service

### File: `pi-server/services/camera_service.py`
**Task**: Extract all PiCamera2 management logic

**Class**: `CameraService`

**Methods to extract**:
- `_init_camera()` → `init_camera()`
- `_placeholder_frame()` → `get_placeholder_frame()`
- `_get_frame_array()` → `get_frame_array()`
- Stream management functions
- Recording logic

**Manage state**:
- `picam` instance
- `stream_active` flag
- `latest_stream_frame`
- Stream locks

**Example structure**:
```python
from picamera2 import Picamera2
from picamera2.encoders import MJPEGEncoder, H264Encoder
import threading
from typing import Optional
import numpy as np

class CameraService:
    def __init__(self):
        self.picam: Optional[Picamera2] = None
        self.stream_active = False
        self.latest_stream_frame: Optional[np.ndarray] = None
        self.latest_stream_lock = threading.Lock()
        # ... other state
    
    def init_camera(self):
        """Initialize PiCamera2"""
        ...
    
    def get_frame_array(self) -> Optional[np.ndarray]:
        """Get current frame as numpy array"""
        ...
    
    def start_stream(self):
        """Start MJPEG stream"""
        ...
    
    def stop_stream(self):
        """Stop MJPEG stream"""
        ...
```

## Phase 5: Motion Detection Service

### File: `pi-server/services/motion_service.py`
**Task**: Extract motion detection logic

**Class**: `MotionService`

**Methods to extract**:
- `_motion_loop()` → `motion_loop()`
- Motion detection algorithm
- Contour detection
- Background subtraction
- Clip recording logic

**Manage state**:
- `background_frame`
- `last_motion_ts`
- `motion_enabled`
- `motion_metrics`
- `motion_thread`

**Dependencies**: Will need `CameraService` instance

## Phase 6: Notification Service

### File: `pi-server/services/notification_service.py`
**Task**: Extract push notification logic

**Class**: `NotificationService`

**Methods to extract**:
- `_send_push_notification()` → `send_notification()`
- Push token management
- Token persistence (push_tokens.json)
- Notification cooldown logic

**Manage state**:
- `push_tokens` set
- `last_notification_time`
- `motion_notifications` list

## Phase 7: Utility Functions

### File: `pi-server/utils/helpers.py`
**Task**: Extract standalone utility functions

**Functions to extract**:
- `_clamp()` → `clamp()`
- `_cleanup_old_media()` → `cleanup_old_media()`
- Any other helper functions

**Example**:
```python
from pathlib import Path
import time
import os

def clamp(value: float, minimum: int, maximum: int) -> float:
    """Clamp value between min and max"""
    return max(minimum, min(maximum, value))

def cleanup_old_media(media_dir: Path, retention_days: int):
    """Delete media files older than retention_days"""
    ...
```

## Phase 8: API Routers

### File: `pi-server/routers/camera.py`
**Task**: Extract camera-related endpoints

**Endpoints to move**:
- `GET /camera` - Get camera info/status
- `GET /preview` - Get single frame
- `GET /stream` - MJPEG stream
- `GET /snapshot` - Take snapshot
- `POST /record` - Start recording
- `GET /recording/status` - Recording status
- `POST /recording/stop` - Stop recording

**Example structure**:
```python
from fastapi import APIRouter, HTTPException
from ..services import CameraService
from ..models import RecordRequest
from ..config import config

router = APIRouter(prefix="/camera", tags=["camera"])
camera_service = CameraService()

@router.get("/")
async def get_camera_info():
    """Get camera status and info"""
    ...

@router.get("/preview")
async def get_preview():
    """Get single frame preview"""
    ...
```

### File: `pi-server/routers/motion.py`
**Task**: Extract motion detection endpoints

**Endpoints**:
- `GET /motion` - Motion status
- `POST /motion/start` - Start motion detection
- `POST /motion/stop` - Stop motion detection
- `POST /motion/settings` - Update motion settings
- `GET /motion/metrics` - Get motion metrics
- `GET /motion/history` - Get motion history

### File: `pi-server/routers/azure.py`
**Task**: Extract Azure endpoints

**Endpoints**:
- `GET /azure/blobs` - List blobs
- `GET /azure/media/{blob_name:path}` - Download blob (with Range support)

### File: `pi-server/routers/events.py`
**Task**: Extract events endpoints

**Endpoints**:
- `GET /events` - List local events
- `GET /media/{filename}` - Get local media file
- `POST /media/delete` - Delete media file

### File: `pi-server/routers/__init__.py`
```python
from .camera import router as camera_router
from .motion import router as motion_router
from .azure import router as azure_router
from .events import router as events_router
```

## Phase 9: Update main.py

### File: `pi-server/main.py`
**Task**: Reduce to app setup and registration only

**Should contain**:
- FastAPI app initialization
- CORS middleware
- Router registration
- Startup events
- Shutdown events
- Push token registration endpoints (or move to separate router)
- Health check endpoint

**Example structure**:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import camera_router, motion_router, azure_router, events_router
from .services import MotionService, NotificationService
from .config import config
import threading

app = FastAPI(title="retrosPiCam API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
motion_service = MotionService()
notification_service = NotificationService()

# Routers
app.include_router(camera_router)
app.include_router(motion_router)
app.include_router(azure_router)
app.include_router(events_router)

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    # Start motion detection if enabled
    # Load push tokens
    # Start cleanup thread
    # Initialize GPIO if enabled
    pass

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    pass

@app.get("/")
async def root():
    return {"status": "retrosPiCam API running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

## Phase 10: Testing Strategy

**Before merging**:
1. [ ] Test all camera endpoints work
2. [ ] Test motion detection still functions
3. [ ] Test Azure upload/download works
4. [ ] Test Range requests for video streaming
5. [ ] Test push notifications
6. [ ] Test GPIO button (if hardware available)
7. [ ] Test RTC integration (if hardware available)
8. [ ] Check for any import errors
9. [ ] Verify systemd service still works
10. [ ] Deploy to test Pi before production

**Test commands**:
```bash
# Start server
cd pi-server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Test endpoints
curl http://localhost:8000/
curl http://localhost:8000/camera
curl http://localhost:8000/motion
curl http://localhost:8000/azure/blobs
```

## Important Notes

### DO NOT CHANGE:
- ✅ API endpoint URLs (maintain backward compatibility)
- ✅ Request/response formats
- ✅ Environment variable names
- ✅ File paths in .env
- ✅ Functionality or behavior

### DO CHANGE:
- ✅ Code organization
- ✅ File structure
- ✅ Import statements
- ✅ Class/function names (internal only)

### Import Strategy:
All files should use **relative imports** within the pi-server package:
```python
from ..config import config
from ..services import AzureService
from ..models import RecordRequest
```

### Error Handling:
Preserve all existing try/except blocks and error handling logic. Add more if beneficial.

### Thread Safety:
Maintain all existing locks and thread safety mechanisms. Motion detection and streaming rely on proper locking.

## Success Criteria
- [ ] main.py < 200 lines
- [ ] Each router file < 200 lines
- [ ] Each service file < 300 lines
- [ ] All endpoints work identically
- [ ] No breaking changes to API
- [ ] Code is more maintainable
- [ ] Clear separation of concerns
- [ ] Easier to test components

## Next Steps After Refactoring
1. Add unit tests for services
2. Add API documentation (OpenAPI)
3. Add logging throughout
4. Consider dependency injection
5. Add type hints everywhere

---

**START HERE**: Begin with Phase 1 (config.py), then Phase 2 (schemas.py), then Phase 3 (azure_service.py). Work incrementally and test after each phase.

## Execution Log (Codex)

### Completed
- Phase 1: `config.py` extracted and wired via `settings`.
- Phase 2: Pydantic schemas extracted to `models/schemas.py`.
- Phase 3: Azure storage logic extracted to `services/azure_service.py`.
- Phase 8 (partial): Azure routes moved to `routers/azure.py` and registered in app.
- Phase 8 (partial): Camera/stream/record/RTC routes moved to `routers/camera.py` and registered in app.
- Phase 8 (partial): Events/media routes moved to `routers/events.py` and registered in app.
- Phase 8 (partial): Notification routes moved to `routers/notifications.py` and registered in app.
- Phase 8 (partial): Motion/status routes moved to `routers/motion.py` and registered in app.
- Phase 7 (partial): Helpers extracted to `utils/helpers.py` (`clamp`, `cleanup_old_media`).
- Phase 6 (partial): Notification/push-token logic extracted to `services/notification_service.py` and wired through main.
- Phase 5 (partial): Motion detection loop/settings/metrics extracted to `services/motion_service.py` and wired through `main.py` handlers.
- Phase 4 (partial): Camera stream/photo/frame lifecycle extracted to `services/camera_service.py` and wired through `main.py` handlers.
- Phase 4 (partial): Manual recording capture/conversion moved into `CameraService.record_video()` with `main.py` delegating orchestration.
- RTC endpoints/logic removed from active backend path (deprecated).
- Startup/thread orchestration extracted to `services/startup_service.py`.
- Physical button polling/press behavior extracted to `services/button_service.py`.
- Final composition pass: orchestration helpers moved into `services/backend_service.py`; `main.py` reduced to service wiring + router registration.

### In Progress
- Phase 4/5/8/9: Camera + motion services/routers and slimming `main.py` to orchestration-only.

### Safety Notes
- Endpoint compatibility preserved for existing Azure and notification APIs.
- Incremental extraction strategy is being used to keep Pi runtime behavior stable after each change.
