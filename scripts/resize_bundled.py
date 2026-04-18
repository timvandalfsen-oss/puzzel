"""Resize de foto's uit C:\\ClaudeDesk\\ImagesPuzzle naar puzzel-app/bundled/.

Doel:
- Lange zijde max 1500 px (goed genoeg voor 80-stukjes op telefoon).
- JPEG quality 82 (~200-400 KB per foto).
- EXIF-rotatie toepassen zodat portret-foto's niet kantelen in de browser.
- Bestandsnamen normaliseren (geen spaties/diacritics in URL's).

Run:
    python scripts/resize_bundled.py
"""
from pathlib import Path
from PIL import Image, ImageOps
import json
import re

SRC = Path(r"C:\ClaudeDesk\ImagesPuzzle")
DST = Path(__file__).parent.parent / "bundled"
MAX_SIDE = 1500
QUALITY = 82

def slugify(name: str) -> str:
    stem = Path(name).stem.lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return f"{stem}.jpg"

def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    manifest = []

    for src_file in sorted(SRC.iterdir()):
        if src_file.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        with Image.open(src_file) as im:
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGB")
            w, h = im.size
            scale = MAX_SIDE / max(w, h)
            if scale < 1:
                im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            out_name = slugify(src_file.name)
            out_path = DST / out_name
            im.save(out_path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            size_kb = out_path.stat().st_size // 1024
            manifest.append({
                "file": f"bundled/{out_name}",
                "w": im.width,
                "h": im.height,
            })
            print(f"  {src_file.name} -> {out_name}  ({im.width}x{im.height}, {size_kb} KB)")

    manifest_path = DST / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nOK  {len(manifest)} foto's opgeslagen in {DST}")
    print(f"Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
