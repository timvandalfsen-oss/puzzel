// Kleine IndexedDB-wrapper — géén externe library, ~80 regels die we snappen.
//
// 3 object stores:
//   - "photos"  key = id (string)           value = { id, blob (Blob), addedAt (number) }
//   - "state"   key = "current"             value = { savegame-JSON }
//   - "meta"    key = arbitrary             value = anything (bv. high scores later)

const DB_NAME = "puzzel-app";
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("state"))  db.createObjectStore("state");
      if (!db.objectStoreNames.contains("meta"))   db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode = "readonly") {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

function wrap(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ---------- Photos ----------
export async function listPhotos() {
  const store = await tx("photos");
  return wrap(store.getAll());
}

export async function addPhoto(blob) {
  const id = "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const store = await tx("photos", "readwrite");
  await wrap(store.add({ id, blob, addedAt: Date.now() }));
  return id;
}

export async function deletePhoto(id) {
  const store = await tx("photos", "readwrite");
  return wrap(store.delete(id));
}

export async function getPhotoBlob(id) {
  const store = await tx("photos");
  const rec = await wrap(store.get(id));
  return rec ? rec.blob : null;
}

// ---------- Game state (save / resume) ----------
export async function saveGameState(state) {
  const store = await tx("state", "readwrite");
  return wrap(store.put(state, "current"));
}

export async function loadGameState() {
  const store = await tx("state");
  return wrap(store.get("current"));
}

export async function clearGameState() {
  const store = await tx("state", "readwrite");
  return wrap(store.delete("current"));
}
