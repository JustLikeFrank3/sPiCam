import threading
import time
from typing import Callable


class StartupService:
    def __init__(
        self,
        start_motion_thread: Callable[[], None],
        start_button_handler: Callable[[], None],
        run_cleanup: Callable[[], None],
    ) -> None:
        self.start_motion_thread = start_motion_thread
        self.start_button_handler = start_button_handler
        self.run_cleanup = run_cleanup

    def _delayed_motion_start(self) -> None:
        print("Delaying motion thread start for 5 seconds...")
        time.sleep(5)
        print("Starting motion detection thread")
        self.start_motion_thread()

    def _run_startup_cleanup(self) -> None:
        print("Running one-time media cleanup at startup...")
        time.sleep(10)
        self.run_cleanup()

    def start_background_tasks(self) -> None:
        threading.Thread(target=self._delayed_motion_start, daemon=True).start()
        threading.Thread(target=self.start_button_handler, daemon=True).start()
        threading.Thread(target=self._run_startup_cleanup, daemon=True).start()
