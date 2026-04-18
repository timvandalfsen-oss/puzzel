"""Download ~14 diverse stock foto's van Picsum (Lorem Picsum, CC-licentie van Unsplash).

- Picsum vereist geen API-key.
- We gebruiken vaste IDs zodat de collectie reproduceerbaar is.
- Elke foto wordt opgeslagen als 1500x1000 JPEG, quality 82 (~150-300 KB).

Run:
    python scripts/fetch_stock.py
"""
from pathlib import Path
from io import BytesIO
import json
import requests
from PIL import Image

# Gecureerde selectie van Picsum-IDs — visueel divers, geschikt voor puzzels.
PICSUM_IDS = [
    10,    # bos weg
    15,    # bergmeer reflectie
    29,    # klippen
    37,    # strand
    57,    # bergen + meer
    76,    # veld
    111,   # boot / zee
    128,   # hond portret
    164,   # water
    244,   # skyline
    326,   # architectuur binnen
    417,   # bloemen
    659,   # zonsondergang
    883,   # berg piek
    1019,  # gebouw hoek
    1040,  # mist bos
]

DST = Path(__file__).parent.parent / "stock"
WIDTH = 1500
HEIGHT = 1000
QUALITY = 82

def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    manifest = []
    for pid in PICSUM_IDS:
        url = f"https://picsum.photos/id/{pid}/{WIDTH}/{HEIGHT}.jpg"
        print(f"  GET {url}")
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        im = Image.open(BytesIO(r.content)).convert("RGB")
        out_name = f"picsum-{pid}.jpg"
        out_path = DST / out_name
        im.save(out_path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        size_kb = out_path.stat().st_size // 1024
        manifest.append({
            "file": f"stock/{out_name}",
            "w": im.width,
            "h": im.height,
        })
        print(f"    -> {out_name}  ({size_kb} KB)")

    manifest_path = DST / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nOK  {len(manifest)} stock-foto's in {DST}")

if __name__ == "__main__":
    main()
