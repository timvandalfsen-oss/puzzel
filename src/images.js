// Image-pool management:
//   - Laadt manifests voor de ingebouwde stock- en bundled-foto's.
//   - Combineert bundled + user-uploaded foto's tot de "own"-pool.
//   - Bij upload: resize client-side via <canvas> naar max 1500px lange zijde (JPEG q=0.85).
//   - Levert object-URLs voor user-foto's en pad-URLs voor ingebouwde foto's.

import { addPhoto, listPhotos, getPhotoBlob, deletePhoto } from "./storage.js";

const MAX_SIDE = 1500;
const JPEG_QUALITY = 0.85;

// ---------- Manifest laden ----------
async function fetchManifest(path) {
  try {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) {
    console.warn("manifest niet gevonden:", path, e);
    return [];
  }
}

let _stockManifest = null;
let _bundledManifest = null;

export async function getStockImages() {
  if (!_stockManifest) _stockManifest = await fetchManifest("stock/manifest.json");
  return _stockManifest.map(m => ({
    id: "stock:" + m.file,
    kind: "stock",
    url: m.file,
    w: m.w, h: m.h,
  }));
}

export async function getBundledImages() {
  if (!_bundledManifest) _bundledManifest = await fetchManifest("bundled/manifest.json");
  return _bundledManifest.map(m => ({
    id: "bundled:" + m.file,
    kind: "bundled",
    url: m.file,
    w: m.w, h: m.h,
  }));
}

// ---------- "Own" pool = bundled + user-uploaded ----------
export async function getOwnImages() {
  const [bundled, userRecords] = await Promise.all([getBundledImages(), listPhotos()]);
  const userImgs = userRecords.map(r => ({
    id: r.id,
    kind: "user",
    url: URL.createObjectURL(r.blob),
    w: null, h: null, // onbekend; wordt in puzzle.js gemeten
  }));
  return [...bundled, ...userImgs];
}

// ---------- Random picker ----------
export function pickRandom(images) {
  if (!images.length) return null;
  return images[Math.floor(Math.random() * images.length)];
}

// ---------- Upload: resize en opslaan ----------
export async function uploadAndStore(file) {
  if (!file.type.startsWith("image/")) throw new Error("Geen afbeelding");
  const blob = await resizeImageBlob(file);
  const id = await addPhoto(blob);
  return id;
}

async function resizeImageBlob(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    // Safari oudere versies: fallback via Image + canvas
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      return im;
    } finally { URL.revokeObjectURL(url); }
  });

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW; canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);

  return new Promise((res, rej) => {
    canvas.toBlob(
      b => b ? res(b) : rej(new Error("toBlob mislukt")),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// ---------- Verwijder user-foto ----------
export async function removeUserPhoto(id) {
  return deletePhoto(id);
}

// ---------- Download image naar memory (voor puzzle-engine) ----------
export async function loadImageElement(url) {
  return loadImage(url);
}

// ---------- Resolve URL voor een save-state image (kan user-foto zijn) ----------
export async function resolveImageUrl(ref) {
  // ref = { kind, url OR id }
  if (ref.kind === "user") {
    const blob = await getPhotoBlob(ref.id);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
  return ref.url;
}
