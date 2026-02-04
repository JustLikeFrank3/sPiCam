from PIL import Image
import os

# ==== CONFIG ====
input_png = "spicam_icon_1024.png"  # Your original PNG
output_folder = "spicam_icons"      # Folder to store resized icons
sizes = [32, 64, 128, 256, 512, 1024]  # Standard app icon sizes

# ==== CREATE OUTPUT FOLDER ====
os.makedirs(output_folder, exist_ok=True)

# ==== OPEN ORIGINAL IMAGE ====
img = Image.open(input_png)

# ==== GENERATE ICONS ====
for s in sizes:
    resized = img.resize((s, s), Image.LANCZOS)
    out_path = os.path.join(output_folder, f"icon_{s}.png")
    resized.save(out_path)
    print(f"Saved {out_path}")

print("✅ All icon sizes generated successfully!")
