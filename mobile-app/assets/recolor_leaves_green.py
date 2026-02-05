from __future__ import annotations

import colorsys
import re
from pathlib import Path

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install with: python -m pip install pillow\n"
        f"Original error: {exc}"
    )


X0, X1 = 180, 844
Y_MAX = 223
TARGET_HUE = 120 / 360  # green
MIN_V, MAX_V = 0.15, 0.85


def _is_raspberry_red(hue_deg: float, sat: float) -> bool:
    return (hue_deg <= 25 or hue_deg >= 330) and sat > 0.15


def _recolor_rgb(r: int, g: int, b: int) -> tuple[int, int, int] | None:
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hue_deg = h * 360

    if v < MIN_V or v > MAX_V:
        return None
    if _is_raspberry_red(hue_deg, s):
        return None

    # Drop near-grays (keeps outlines/background intact)
    if s < 0.03:
        return None

    # Keep foliage-ish hues; avoid blues/purples
    if not (60 <= hue_deg <= 200):
        return None

    new_s = max(s * 4.0, 0.55)
    new_s = min(new_s, 0.90)
    new_v = min(max(v * 1.02, 0.0), 1.0)
    nr, ng, nb = colorsys.hsv_to_rgb(TARGET_HUE, new_s, new_v)
    return int(round(nr * 255)), int(round(ng * 255)), int(round(nb * 255))


def recolor_png(png_path: Path) -> int:
    img = Image.open(png_path).convert("RGBA")
    w, h = img.size
    px = img.load()

    changed = 0
    for y in range(min(Y_MAX, h)):
        for x in range(w):
            if x < X0 or x > X1:
                continue
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            recolored = _recolor_rgb(r, g, b)
            if recolored is None:
                continue
            nr, ng, nb = recolored
            if (nr, ng, nb) != (r, g, b):
                px[x, y] = (nr, ng, nb, a)
                changed += 1

    img.save(png_path)
    return changed


_RECT_RE = re.compile(
    r'(<rect\s+fill=")(?P<fill>#[0-9a-fA-F]{6})("\s+height="1px"\s+width="1px"\s+x=")(?P<x>\d+)("\s+y=")(?P<y>\d+)("\s*/>)'
)


def recolor_svg_pixel_rects(svg_path: Path) -> int:
    changed = 0
    tmp_path = svg_path.with_suffix(svg_path.suffix + ".tmp")

    with open(svg_path, "r", encoding="utf-8", errors="ignore", newline="") as src, open(
        tmp_path, "w", encoding="utf-8", newline=""
    ) as dst:
        for line in src:
            m = _RECT_RE.search(line)
            if not m:
                dst.write(line)
                continue

            x = int(m.group("x"))
            y = int(m.group("y"))
            if y >= Y_MAX or x < X0 or x > X1:
                dst.write(line)
                continue

            fill = m.group("fill")
            r = int(fill[1:3], 16)
            g = int(fill[3:5], 16)
            b = int(fill[5:7], 16)

            recolored = _recolor_rgb(r, g, b)
            if recolored is None:
                dst.write(line)
                continue

            nr, ng, nb = recolored
            new_fill = f"#{nr:02x}{ng:02x}{nb:02x}"
            if new_fill.lower() == fill.lower():
                dst.write(line)
                continue

            new_line = (
                line[: m.start("fill")]
                + new_fill
                + line[m.end("fill") :]
            )
            dst.write(new_line)
            changed += 1

    tmp_path.replace(svg_path)
    return changed


def main() -> None:
    png_path = Path(__file__).with_name("spicam_icon_1024.png")
    svg_path = Path(__file__).with_name("sPiCamLogoV2.svg")

    png_changed = recolor_png(png_path)
    print(f"PNG updated: {png_path} (changed_pixels={png_changed})")

    # SVG is stored via Git LFS, but is still editable text.
    svg_changed = recolor_svg_pixel_rects(svg_path)
    print(f"SVG updated: {svg_path} (changed_rects={svg_changed})")


if __name__ == "__main__":
    main()
