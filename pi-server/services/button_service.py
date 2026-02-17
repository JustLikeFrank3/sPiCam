import threading
import time
from typing import Callable


class ButtonService:
    def __init__(
        self,
        enabled: bool,
        gpio_pin: int,
        capture_photo: Callable[[], None],
        start_recording: Callable[[int], None],
    ) -> None:
        self.enabled = enabled
        self.gpio_pin = gpio_pin
        self.capture_photo = capture_photo
        self.start_recording = start_recording
        self.button_gpio_initialized = False

    def _init_gpio(self) -> bool:
        if self.button_gpio_initialized or not self.enabled:
            return self.button_gpio_initialized
        try:
            import RPi.GPIO as GPIO

            GPIO.setwarnings(False)
            try:
                GPIO.cleanup(self.gpio_pin)
            except Exception:
                pass
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.gpio_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            self.button_gpio_initialized = True
            print(f"[PiCam] Shutter button initialized on GPIO {self.gpio_pin}")
        except Exception as exc:
            print(f"[PiCam] Button GPIO init failed: {exc}")
        return self.button_gpio_initialized

    def loop(self) -> None:
        if not self.enabled or not self._init_gpio():
            return

        import RPi.GPIO as GPIO

        print("[PiCam] Button handler thread started (polling mode)")
        last_state = GPIO.HIGH

        while True:
            try:
                current_state = GPIO.input(self.gpio_pin)
                if last_state == GPIO.HIGH and current_state == GPIO.LOW:
                    print(f"[PiCam] Button press detected on GPIO {self.gpio_pin}")
                    press_start = time.time()

                    while GPIO.input(self.gpio_pin) == GPIO.LOW:
                        time.sleep(0.05)

                    press_duration = time.time() - press_start
                    print(f"[PiCam] Button released after {press_duration:.2f}s")

                    if press_duration < 0.5:
                        print(f"[PiCam] Button: short press ({press_duration:.2f}s) - capturing photo")
                        self.capture_photo()
                    elif press_duration < 2.0:
                        print(f"[PiCam] Button: medium hold ({press_duration:.2f}s) - recording 30s")
                        self.start_recording(30)
                    else:
                        print(f"[PiCam] Button: long hold ({press_duration:.2f}s) - recording 60s")
                        self.start_recording(60)

                    time.sleep(0.3)

                last_state = current_state
                time.sleep(0.01)
            except Exception as exc:
                import traceback

                print(f"[PiCam] Button handler error: {type(exc).__name__}: {exc}")
                print(f"[PiCam] Traceback: {traceback.format_exc()}")
                time.sleep(1)

    def start(self) -> None:
        if not self.enabled:
            return
        threading.Thread(target=self.loop, daemon=True).start()
