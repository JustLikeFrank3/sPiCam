from pydantic import BaseModel
from typing import Optional


class RecordRequest(BaseModel):
    duration: int = 30


class PushTokenRequest(BaseModel):
    token: str


class MotionSettings(BaseModel):
    threshold: Optional[int] = None
    min_area: Optional[int] = None
    cooldown: Optional[int] = None
