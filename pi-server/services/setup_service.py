"""
Setup service — WiFi provisioning for first-time configuration.

On a fresh (unconfigured) Pi, the Pi starts in AP mode (RetrosPiCam-Setup).
This service is reachable at 192.168.4.1:8000 and handles:
  - Reporting configuration state
  - Scanning nearby WiFi networks (via nmcli)
  - Accepting WiFi credentials, adding an NM connection, and rebooting
    the Pi into normal client mode.

Pi OS Bookworm uses NetworkManager — wpa_supplicant.conf / dhcpcd are NOT used.
"""

import subprocess
import threading
import time
from pathlib import Path

# Marker file lives alongside main.py (pi-server/.wifi_configured)
_BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGURED_MARKER = _BASE_DIR / ".wifi_configured"

AP_CON_NAME = "RetrosPiCam-Setup"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    """Return True if WiFi credentials have been provisioned."""
    return CONFIGURED_MARKER.exists()


def scan_networks() -> list[dict]:
    """Return list of {ssid: str, signal: int} sorted strongest first."""
    try:
        # Trigger a fresh scan first (best-effort)
        subprocess.run(
            ["sudo", "nmcli", "dev", "wifi", "rescan"],
            capture_output=True, timeout=10,
        )
        result = subprocess.run(
            ["nmcli", "-t", "-f", "SSID,SIGNAL", "dev", "wifi", "list"],
            capture_output=True, text=True, timeout=15,
        )
        return _parse_nmcli_wifi(result.stdout)
    except Exception as exc:
        print(f"[RetrosPiCam] WiFi scan failed: {exc}")
        return []


def save_wifi_and_reboot(ssid: str, password: str) -> None:
    """Add NM WiFi connection, mark configured, and reboot."""
    _configure_wifi_nmcli(ssid, password)
    CONFIGURED_MARKER.touch()
    # Reboot after short delay so HTTP response can be delivered
    threading.Thread(target=_delayed_reboot, daemon=True).start()


def factory_reset() -> None:
    """Delete wifi_configured marker and reboot into AP setup mode."""
    print("[RetrosPiCam] Factory reset triggered — removing WiFi config and rebooting into setup mode")
    if CONFIGURED_MARKER.exists():
        CONFIGURED_MARKER.unlink()
    threading.Thread(target=_delayed_reboot, daemon=True).start()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_nmcli_wifi(output: str) -> list[dict]:
    """Parse `nmcli -t -f SSID,SIGNAL dev wifi list` output."""
    networks: list[dict] = []
    seen: set[str] = set()
    for line in output.splitlines():
        parts = line.split(":")
        if len(parts) < 2:
            continue
        ssid = parts[0].strip()
        try:
            signal = int(parts[1].strip())
        except ValueError:
            signal = 0
        if ssid and ssid not in seen:
            seen.add(ssid)
            networks.append({"ssid": ssid, "signal": signal})
    networks.sort(key=lambda x: x["signal"], reverse=True)
    return networks


def _configure_wifi_nmcli(ssid: str, password: str) -> None:
    """Create (or replace) a NM WiFi connection for the given credentials."""
    # Remove any existing connection with this name (idempotent)
    subprocess.run(
        ["sudo", "nmcli", "con", "delete", ssid],
        check=False, capture_output=True,
    )
    # Add the new connection with autoconnect enabled and priority 50
    # (lower than AP priority 100 so NM won't fight us while still in setup mode,
    # but _delayed_reboot deletes the AP before reboot so it wins on next boot)
    subprocess.run(
        [
            "sudo", "nmcli", "con", "add",
            "type", "wifi",
            "ifname", "wlan0",
            "con-name", ssid,
            "ssid", ssid,
            "wifi-sec.key-mgmt", "wpa-psk",
            "wifi-sec.psk", password,
            "connection.autoconnect", "yes",
            "connection.autoconnect-priority", "50",
        ],
        check=True,
    )


def _delayed_reboot() -> None:
    time.sleep(3)
    # Tear down and remove the AP hotspot connection
    subprocess.run(["sudo", "nmcli", "con", "down", AP_CON_NAME], check=False, capture_output=True)
    subprocess.run(["sudo", "nmcli", "con", "delete", AP_CON_NAME], check=False, capture_output=True)
    subprocess.run(["sudo", "reboot"], check=False)
