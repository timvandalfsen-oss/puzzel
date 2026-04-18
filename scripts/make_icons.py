"""Genereer PWA-icons: 192x192, 512x512 (standard + maskable).

Simpel design: donkere achtergrond + 3x4 raster van pastelkleurige tegels,
met een lichte lijn tussen de tegels — suggereert een legpuzzel.

Run:
    python scripts/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent.parent / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (24, 28, 36, 255)          # donker grijsblauw
TILE_COLORS = [
    (239, 190, 125), (170, 199, 156), (152, 180, 212),
    (223, 161, 159), (200, 181, 228), (160, 214, 198),
    (245, 215, 142), (195, 168, 148), (224, 185, 210),
    (181, 204, 224), (207, 195, 163), (163, 196, 191),
]
COLS, ROWS = 3, 4

def draw_icon(size: int, padded: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.18) if padded else int(size * 0.10)
    inner = size - pad * 2
    tile_w = inner / COLS
    tile_h = inner / ROWS
    gap = max(2, size // 64)
    for r in range(ROWS):
        for c in range(COLS):
            x0 = pad + c * tile_w + gap / 2
            y0 = pad + r * tile_h + gap / 2
            x1 = pad + (c + 1) * tile_w - gap / 2
            y1 = pad + (r + 1) * tile_h - gap / 2
            color = TILE_COLORS[(r * COLS + c) % len(TILE_COLORS)]
            radius = max(4, size // 40)
            draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=color)
    return img

def main() -> None:
    draw_icon(192, padded=False).save(OUT / "icon-192.png")
    draw_icon(512, padded=False).save(OUT / "icon-512.png")
    # Maskable: meer padding zodat Android hem kan croppen naar cirkel/rounded-square.
    draw_icon(512, padded=True).save(OUT / "icon-maskable-512.png")
    # Favicon voor in de browser-tab
    draw_icon(64, padded=False).save(OUT / "favicon.png")
    for p in OUT.iterdir():
        print(f"  {p.name}  ({p.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
