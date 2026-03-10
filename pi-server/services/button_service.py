import threading
import time
from typing import Callable

# Hold shutter button this long (seconds) to trigger factory reset
SHUTTER_RESET_HOLD_SEC = 10.0

# Hold dedicated reset pin this long (seconds) to trigger factory reset
RESET_PIN_HOLD_SEC = 3.0


class ButtonService:
    def __init__(
        self,
        enabled: bool,
        gpio_pin: int,
        capture_photo: Callable[[], None],
        start_recording: Callable[[int], None],
        factory_reset: Callable[[], None],
        reset_button_enabled: bool = False,
        reset_button_gpio: int = 27,
    ) -> None:
        self.enabled = enabled
        self.gpio_pin = gpio_pin
        self.capture_photo = capture_photo
        self.start_recording = start_recording
        self.factory_reset = factory_reset
        self.reset_button_enabled = reset_button_enabled
        self.reset_button_gpio = reset_button_gpio
        self.button_gpio_initialized = False

    def _init_gpio(self) -> bool:
        if self.button_gpio_initialized or not self.enabled:
            return self.button_gpio_initialized
        try:
            import RPi.GPIO as GPIO

            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            for pin in set([self.gpio_pin, self.reset_button_gpio] if self.reset_button_enabled else [self.gpio_pin]):
                try:
                    GPIO.cleanup(pin)
                except Exception:
                    pass
                GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            self.button_gpio_initialized = True
            print(f"[RetrosPiCam] Shutter button initialized on GPIO {self.gpio_pin}")
            if self.reset_button_enabled:
                print(f"[RetrosPiCam] Reset button initialized on GPIO {self.reset_button_gpio} (hold {RESET_PIN_HOLD_SEC:.0f}s to factory reset)")
        except Exception as exc:
            print(f"[RetrosPiCam] Button GPIO init failed: {exc}")
        return self.button_gpio_initialized

    def _handle_shutter_press(self, press_duration: float) -> None:
        """Dispatch shutter press based on hold duration."""
        if press_duration >= SHUTTER_RESET_HOLD_SEC:
            print(f"[RetrosPiCam] Button: factory reset hold ({press_duration:.2f}s) - triggering factory reset")
            self.factory_reset()
        elif press_duration < 0.5:
            print(f"[RetrosPiCam] Button: short press ({press_duration:.2f}s) - capturing photo")
            self.capture_photo()
        elif press_duration < 2.0:
            print(f"[RetrosPiCam] Button: medium hold ({press_duration:.2f}s) - recording 30s")
            self.start_recording(30)
        else:
            print(f"[RetrosPiCam] Button: long hold ({press_duration:.2f}s) - recording 60s")
            self.start_recording(60)

    def _wait_for_release(self, gpio: object) -> float:
        """Block until button is released; return hold duration in seconds.
        Logs a warning when approaching factory-reset threshold."""
        press_start = time.time()
        warned = False
        while gpio.input(self.gpio_pin) == gpio.LOW:  # type: ignore[attr-defined]
            elapsed = time.time() - press_start
            if not warned and elapsed >= SHUTTER_RESET_HOLD_SEC - 3:
                print(f"[RetrosPiCam] Button held {elapsed:.1f}s — release in 3s or factory reset will trigger")
                warned = True
            time.sleep(0.05)
        return time.time() - press_start

    def loop(self) -> None:
        if not self.enabled or not self._init_gpio():
            return

        import RPi.GPIO as GPIO

        print("[RetrosPiCam] Button handler thread started (polling mode)")
        last_state = GPIO.HIGH

        while True:
            try:
                current_state = GPIO.input(self.gpio_pin)
                if last_state == GPIO.HIGH and current_state == GPIO.LOW:
                    print(f"[RetrosPiCam] Button press detected on GPIO {self.gpio_pin}")
                    press_duration = self._wait_for_release(GPIO)                    print(f"[RetrosPiCam] Button released after {press_duration:.2f}s")
                    self._handle_shutter_press(press_duration)
                    time.sleep(0.3)

                last_state = current_state
                time.sleep(0.01)
            except Exception as exc:
                import traceback

                print(f"[RetrosPiCam] Button handler error: {type(exc).__name__}: {exc}")
                print(f"[RetrosPiCam] Traceback: {traceback.format_exc()}")
                time.sleep(1)

    def reset_loop(self) -> None:
        """Monitor dedicated reset GPIO pin. Hold LOW for RESET_PIN_HOLD_SEC → factory reset."""
        if not self.reset_button_enabled or not self._init_gpio():
            return

        import RPi.GPIO as GPIO

        print(f"[RetrosPiCam] Reset button thread started on GPIO {self.reset_button_gpio}")
        last_state = GPIO.HIGH

        while True:
            try:
                current_state = GPIO.input(self.reset_button_gpio)
                if last_state == GPIO.HIGH and current_state == GPIO.LOW:
                    press_start = time.time()
                    while GPIO.input(self.reset_button_gpio) == GPIO.LOW:
                        time.sleep(0.05)
                    press_duration = time.time() - press_start
                    if press_duration >= RESET_PIN_HOLD_SEC:
                        print(f"[RetrosPiCam] Reset pin held {press_duration:.2f}s — triggering factory reset")
                        self.factory_reset()
                    else:
                        print(f"[RetrosPiCam] Reset pin held {press_duration:.2f}s (need {RESET_PIN_HOLD_SEC:.0f}s) — ignored")
                last_state = current_state
                time.sleep(0.01)
            except Exception as exc:
                import traceback

                print(f"[RetrosPiCam] Reset button error: {type(exc).__name__}: {exc}")
                print(f"[RetrosPiCam] Traceback: {traceback.format_exc()}")
                time.sleep(1)

    def start(self) -> None:
        if not self.enabled:
            return
        threading.Thread(target=self.loop, daemon=True).start()
        if self.reset_button_enabled:
            threading.Thread(target=self.reset_loop, daemon=True).start()
