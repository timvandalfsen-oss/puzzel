# Puzzel-app (PWA)

Persoonlijke digitale legpuzzel. Werkt offline op je Android-telefoon na
eenmalige installatie. Geen build-step — pure HTML/JS/CSS.

## Wat zit er in

```
puzzel-app/
├── index.html              app entry
├── manifest.webmanifest    PWA manifest
├── sw.js                   service worker (offline cache)
├── src/                    JS + CSS
├── stock/                  16 stock-foto's (Picsum)
├── bundled/                5 foto's uit ImagesPuzzle/
├── icons/                  app-icons (PWA)
└── scripts/                Python scripts voor asset-prep
```

## Lokaal testen

Geen Node nodig. Je hebt alleen Python (al geïnstalleerd):

```
cd C:\ClaudeDesk\puzzel-app
python -m http.server 8000
```

Open in je browser: `http://localhost:8000`

> **Let op:** de service worker + PWA-installatie werken alleen via HTTPS
> of `localhost`. Vandaar dat `localhost` prima werkt om lokaal te testen.

## Testen op je telefoon (zelfde WiFi)

1. PC-IP opzoeken: `ipconfig` → noteer "IPv4"-adres (bv. `192.168.178.20`).
2. Op je telefoon in Chrome: `http://192.168.178.20:8000`.
3. Let op: de service worker zal NIET registreren via http naar een ander IP,
   dus PWA-install en offline werken niet. Voor dát test-scenario: deploy naar GitHub Pages.

## Deploy naar GitHub Pages (eenmalig opzetten)

1. Maak een GitHub-account op [github.com](https://github.com/) als je er nog geen hebt.
2. Maak een nieuwe repo aan, noem hem bv. `puzzel`. Kies "Public".
3. Terug in PowerShell / Git-bash:
   ```
   cd C:\ClaudeDesk\puzzel-app
   git init
   git add .
   git commit -m "Eerste versie puzzel-app"
   git branch -M main
   git remote add origin https://github.com/JOUW-USERNAME/puzzel.git
   git push -u origin main
   ```
4. Op GitHub: Settings → Pages → Source: "Deploy from a branch" →
   Branch: `main`, Folder: `/ (root)`. Klik **Save**.
5. Wacht ~1 minuut; je krijgt een URL zoals
   `https://JOUW-USERNAME.github.io/puzzel/`.
6. Op je Android-telefoon in Chrome: open die URL →
   menu (⋮) → **App installeren** (of **Toevoegen aan startscherm**).

Elke keer dat je iets wijzigt:
```
git add .
git commit -m "Wijziging X"
git push
```
GitHub Pages update de site automatisch binnen een minuut.

## Galerij koppelen (Android Chrome / Edge)

Op Android kan de app een hele fotomap op je telefoon gebruiken als puzzel-bron:
1. Open de app → sectie **"Mijn foto's"** → **📱 Galerij koppelen**.
2. Kies een map (bv. `DCIM/Camera`, een WhatsApp-Images map, of een eigen verzameling).
3. De app telt hoeveel foto's er staan en toont de status.
4. In het menu wordt de **📱 Galerij** bron-knop actief → kies hem met een moeilijkheid → elke puzzel trekt willekeurig een andere foto uit die map.
5. Bovendien pakt de **🎲 Random** knop voortaan ook uit galerij-foto's.

Werkt niet op iOS (Safari) of Firefox — daar blijft de knop uitgegrijsd. Bij Android Chrome moet je periodiek opnieuw toestemming geven (OS-beperking).

## Nieuwe foto's toevoegen aan de ingebouwde pool

Als je extra foto's wilt bundelen (zichtbaar voor iedereen die de app opent):

1. Plaats de foto in `C:\ClaudeDesk\ImagesPuzzle\`.
2. Run: `python scripts/resize_bundled.py`
3. Commit + push:
   ```
   git add bundled
   git commit -m "Nieuwe foto's bundled"
   git push
   ```

Als je alleen voor jezelf foto's wilt toevoegen → gebruik de **+ Foto toevoegen**-knop
in de app. Die foto's staan alleen lokaal op je telefoon (IndexedDB).

## Meer / andere stock-foto's

1. Pas de IDs aan in `scripts/fetch_stock.py` (variabele `PICSUM_IDS`).
2. Oude `stock/` map leeg maken (of gewoon overschrijven).
3. `python scripts/fetch_stock.py`
4. Commit + push.

## Troubleshooting

| Probleem | Check |
|---|---|
| Service worker werkt niet | Gebruik `localhost` of HTTPS (GitHub Pages). Via IP-adres werkt 'ie niet. |
| Foto's laden niet | Check dat `bundled/manifest.json` en `stock/manifest.json` bestaan en niet leeg zijn. |
| Stukjes plakken niet | Snap-afstand is 45% van stukgrootte. Laat dichter bij de juiste plek los. |
| Na nieuwe versie zie ik nog oude | Bump `CACHE_VERSION` in `sw.js` naar `v2`, commit, push. Service worker vernieuwt dan. |
| 80 stukjes haakt op telefoon | Check in Chrome DevTools of image precacheing slaagt. Anders: minder stukjes, of kleinere foto (pas `MAX_SIDE` in `scripts/resize_bundled.py` aan). |

## Privacy / licenties

- **Stock-foto's**: Picsum (Lorem Picsum) — fotos van Unsplash onder Unsplash-licentie (vrij gebruik).
- **Eigen foto's toegevoegd via de telefoon**: blijven lokaal op je telefoon (IndexedDB), worden niet geüpload.
- **Bundled foto's**: jouw eigen bestanden uit `ImagesPuzzle/`. Als je de repo public maakt zijn ze zichtbaar — zet de repo op **Private** of host via een private Pages alternatief als dat niet gewenst is.
