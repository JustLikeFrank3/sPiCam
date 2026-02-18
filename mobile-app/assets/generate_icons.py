import cairosvg
from PIL import Image
import os
import shutil
import io

# ==== CONFIG ====
svg_input = "spicam_icon.svg"
output_folder = "spicam_icons"
sizes = [32, 64, 128, 256, 512, 1024]

# Destination files to update
IOS_APPICON = "../ios/sPiCam/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
EXPO_ICON   = "spicam_icon_1024.png"

# ==== CREATE OUTPUT FOLDER ====
os.makedirs(output_folder, exist_ok=True)

# ==== RENDER SVG → 1024px PNG (transparent) ====
print(f"Rendering {svg_input} at 1024×1024 (transparent)...")
png_1024_bytes = cairosvg.svg2png(url=svg_input, output_width=1024, output_height=1024)
master = Image.open(io.BytesIO(png_1024_bytes)).convert("RGBA")

# ==== UPDATE MASTER PNGs ====
master.save(EXPO_ICON)
print(f"Updated {EXPO_ICON}")

master.save(IOS_APPICON)
print(f"Updated {IOS_APPICON}")

# ==== GENERATE ALL SIZES ====
for s in sizes:
    resized = master.resize((s, s), Image.LANCZOS)
    out_path = os.path.join(output_folder, f"icon_{s}.png")
    resized.save(out_path)
    print(f"Saved {out_path}")

print("\n✅ All icons generated from SVG (transparent background)!")
