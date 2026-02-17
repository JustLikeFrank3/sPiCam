import asyncio
import json
from datetime import datetime

import httpx

from config import settings


class NotificationService:
    def __init__(self) -> None:
        self.push_tokens: set[str] = set()
        self.motion_notifications: list[dict] = []
        self.max_notifications = 50
        self.push_tokens_file = settings.push_tokens_file

    @property
    def token_count(self) -> int:
        return len(self.push_tokens)

    def add_notification(self, message: str, kind: str = "info") -> None:
        self.motion_notifications.append(
            {
                "message": message,
                "kind": kind,
                "timestamp": datetime.now().isoformat(),
            }
        )
        if len(self.motion_notifications) > self.max_notifications:
            del self.motion_notifications[:-self.max_notifications]

    def get_notifications(self) -> list[dict]:
        return list(reversed(self.motion_notifications))

    def load_push_tokens(self) -> None:
        if not self.push_tokens_file.exists():
            return
        try:
            data = json.loads(self.push_tokens_file.read_text())
            if isinstance(data, list):
                self.push_tokens = {str(token) for token in data}
        except Exception as exc:
            print(f"[PiCam] Failed to load push tokens: {exc}")

    def save_push_tokens(self) -> None:
        try:
            self.push_tokens_file.write_text(json.dumps(sorted(self.push_tokens)))
        except Exception as exc:
            print(f"[PiCam] Failed to save push tokens: {exc}")

    def register_token(self, token: str) -> None:
        self.push_tokens.add(token)
        self.save_push_tokens()

    def unregister_token(self, token: str) -> None:
        self.push_tokens.discard(token)
        self.save_push_tokens()

    async def send_push_notification(self, title: str, body: str, data: dict | None = None) -> None:
        if not self.push_tokens:
            return

        messages = [
            {
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
            }
            for token in self.push_tokens
        ]

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=messages,
                    headers={"Content-Type": "application/json"},
                )
            try:
                payload = response.json()
            except Exception:
                payload = response.text
            print(
                f"Push notification response: status={response.status_code} tokens={len(self.push_tokens)} payload={payload}"
            )
        except Exception as exc:
            print(f"Push notification error: {exc}")

    def send_push_notification_sync(self, title: str, body: str, data: dict | None = None) -> None:
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.send_push_notification(title, body, data))
            loop.close()
        except Exception as exc:
            print(f"Push notification sync error: {exc}")


notification_service = NotificationService()
