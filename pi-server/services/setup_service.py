"""
Setup service — WiFi provisioning for first-time configuration.

On a fresh (unconfigured) Pi, the Pi starts in AP mode (RetrosPiCam-Setup).
This service is reachable at 192.168.4.1:8000 and handles:
  - Reporting configuration state
  - Scanning nearby WiFi networks
  - Accepting WiFi credentials, writing wpa_supplicant.conf, and rebooting
    the Pi into normal client mode.
"""

import re
import subprocess
import threading
import time
from pathlib import Path

# Marker file lives alongside main.py (pi-server/.wifi_configured)
_BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGURED_MARKER = _BASE_DIR / ".wifi_configured"

WPA_CONF = Path("/etc/wpa_supplicant/wpa_supplicant.conf")
DHCPCD_CONF = Path("/etc/dhcpcd.conf")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    """Return True if WiFi credentials have been provisioned."""
    return CONFIGURED_MARKER.exists()


def scan_networks() -> list[dict]:
    """Return list of {ssid: str, signal: int} sorted strongest first."""
    try:
        result = subprocess.run(
            ["sudo", "iwlist", "wlan0", "scan"],
            capture_output=True, text=True, timeout=15,
        )
        return _parse_iwlist(result.stdout)
    except Exception as exc:
        print(f"[RetrosPiCam] WiFi scan failed: {exc}")
        return []


def save_wifi_and_reboot(ssid: str, password: str) -> None:
    """Write credentials, disable AP mode, mark configured, and reboot."""
    _write_wpa_supplicant(ssid, password)
    _restore_dhcpcd()
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

def _parse_iwlist(output: str) -> list[dict]:
    networks: list[dict] = []
    seen: set[str] = set()
    for cell in re.split(r"Cell \d+ -", output):
        ssid_m = re.search(r'ESSID:"([^"]+)"', cell)
        sig_m = re.search(r"Signal level=(-?\d+)", cell)
        if ssid_m:
            ssid = ssid_m.group(1).strip()
            signal = int(sig_m.group(1)) if sig_m else -100
            if ssid and ssid not in seen:
                seen.add(ssid)
                networks.append({"ssid": ssid, "signal": signal})
    networks.sort(key=lambda x: x["signal"], reverse=True)
    return networks


def _write_wpa_supplicant(ssid: str, password: str) -> None:
    content = (
        "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n"
        "update_config=1\n"
        "country=US\n\n"
        "network={\n"
        f'    ssid="{ssid}"\n'
        f'    psk="{password}"\n'
        "}\n"
    )
    WPA_CONF.write_text(content)
    subprocess.run(["sudo", "chmod", "600", str(WPA_CONF)], check=False)


def _restore_dhcpcd() -> None:
    """Remove the static wlan0 block that setup-ap.sh appended."""
    if not DHCPCD_CONF.exists():
        return
    content = DHCPCD_CONF.read_text()
    content = re.sub(
        r"\ninterface wlan0\nstatic ip_address=192\.168\.4\.1/24\nnohook wpa_supplicant\n?",
        "",
        content,
    )
    DHCPCD_CONF.write_text(content)


def _delayed_reboot() -> None:
    time.sleep(3)
    for cmd in [
        ["sudo", "systemctl", "stop", "hostapd"],
        ["sudo", "systemctl", "stop", "dnsmasq"],
        ["sudo", "systemctl", "disable", "hostapd"],
        ["sudo", "systemctl", "disable", "dnsmasq"],
        ["sudo", "reboot"],
    ]:
        subprocess.run(cmd, check=False)
