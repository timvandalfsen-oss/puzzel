// Image-pool management:
//   - Laadt manifests voor de ingebouwde stock- en bundled-foto's.
//   - Combineert bundled + user-uploaded foto's tot de "own"-pool.
//   - Bij upload: resize client-side via <canvas> naar max 1500px lange zijde (JPEG q=0.85).
//   - Levert object-URLs voor user-foto's en pad-URLs voor ingebouwde foto's.

import {
  addPhoto, listPhotos, getPhotoBlob, deletePhoto,
  saveGalleryHandle, loadGalleryHandle, clearGalleryHandle,
  saveGalleryCache, loadGalleryCache,
} from "./storage.js";

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
  // ref = { kind, url OR id OR name }
  if (ref.kind === "user") {
    const blob = await getPhotoBlob(ref.id);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
  if (ref.kind === "gallery") {
    try {
      const blob = await loadGalleryFileBlob(ref.name);
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  }
  return ref.url;
}

// ===========================================================================
// Galerij (File System Access API)
// ===========================================================================

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export function galleryApiSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// Laat de user een map kiezen, sla de handle op en scan files
export async function connectGallery() {
  if (!galleryApiSupported()) throw new Error("Galerij-API niet ondersteund in deze browser");
  const handle = await window.showDirectoryPicker({ mode: "read" });
  await saveGalleryHandle(handle);
  const files = await _scanHandle(handle);
  await saveGalleryCache(files);
  return { dirName: handle.name, fileCount: files.length };
}

export async function disconnectGallery() {
  await clearGalleryHandle();
}

// Status zonder de permission-prompt te triggeren
export async function getGalleryStatus() {
  const handle = await loadGalleryHandle();
  if (!handle) return { connected: false };
  const files = (await loadGalleryCache()) || [];
  return { connected: true, dirName: handle.name, fileCount: files.length };
}

// Vernieuw de filelist-cache (triggert wel een permission check)
export async function refreshGalleryCache() {
  const handle = await loadGalleryHandle();
  if (!handle) throw new Error("Geen galerij verbonden");
  await _ensureReadPermission(handle);
  const files = await _scanHandle(handle);
  await saveGalleryCache(files);
  return files;
}

// Pak een random image, resize, geef blob-URL + ref terug
export async function pickRandomGalleryImage() {
  const handle = await loadGalleryHandle();
  if (!handle) throw new Error("Geen galerij verbonden");
  await _ensureReadPermission(handle);

  let files = (await loadGalleryCache()) || [];
  if (!files.length) {
    files = await _scanHandle(handle);
    await saveGalleryCache(files);
  }
  if (!files.length) throw new Error("Geen foto's in de verbonden map");

  const pick = files[Math.floor(Math.random() * files.length)];
  const blob = await _readFile(handle, pick.name);
  const resized = await resizeImageBlob(blob);
  return {
    url: URL.createObjectURL(resized),
    ref: { kind: "gallery", name: pick.name },
  };
}

// Gebruikt voor save-resume
async function loadGalleryFileBlob(name) {
  const handle = await loadGalleryHandle();
  if (!handle) return null;
  const ok = await _ensureReadPermission(handle);
  if (!ok) return null;
  const blob = await _readFile(handle, name);
  return await resizeImageBlob(blob);
}

// Voor de Random-bron: combineer een subset galerij-files als pseudo-items
export async function getGalleryPickerItems() {
  const status = await getGalleryStatus();
  if (!status.connected) return [];
  const files = (await loadGalleryCache()) || [];
  return files.map(f => ({ id: "gallery:" + f.name, kind: "gallery", name: f.name }));
}

// Laad een gallery-item op naam (gebruikt door Random-flow)
export async function loadGalleryItemUrl(name) {
  const blob = await loadGalleryFileBlob(name);
  return blob ? URL.createObjectURL(blob) : null;
}

// ---------- Interne helpers ----------
async function _ensureReadPermission(handle) {
  const opts = { mode: "read" };
  let state = await handle.queryPermission(opts);
  if (state === "granted") return true;
  state = await handle.requestPermission(opts);
  return state === "granted";
}

async function _scanHandle(handle) {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file") continue;
    if (!IMAGE_EXT.test(name)) continue;
    try {
      const f = await entry.getFile();
      files.push({ name, size: f.size });
    } catch {
      files.push({ name, size: 0 });
    }
  }
  return files;
}

async function _readFile(handle, name) {
  const fh = await handle.getFileHandle(name);
  return await fh.getFile();
}
