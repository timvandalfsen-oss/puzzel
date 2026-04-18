// Service Worker — app-shell + images offline cachen.
//
// Strategie:
//   - App-shell (HTML/CSS/JS/icons) + stock/bundled images: cache-first.
//   - Alles anders (bv. CDN imports, fetch calls): network-first, fallback cache.
//
// Versie ophogen bij elke release zodat oude cache geleegd wordt.

const CACHE_VERSION = "puzzel-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/style.css",
  "./src/main.js",
  "./src/storage.js",
  "./src/images.js",
  "./src/puzzle.js",
  "./src/confetti.js",
  "./icons/favicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./stock/manifest.json",
  "./bundled/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL).catch(err => {
      console.warn("Shell-precache failed:", err);
    });
    // Beste-moeite: stock + bundled images precachen
    try {
      const [stock, bundled] = await Promise.all([
        fetch("stock/manifest.json").then(r => r.json()).catch(() => []),
        fetch("bundled/manifest.json").then(r => r.json()).catch(() => []),
      ]);
      const urls = [...stock, ...bundled].map(m => "./" + m.file);
      for (const url of urls) {
        try { await cache.add(url); } catch (e) { /* negeer */ }
      }
    } catch (e) { console.warn(e); }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Externe CDN (esm.sh etc.) — network-first
  if (url.origin !== self.location.origin) {
    event.respondWith((async () => {
      try {
        const net = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, net.clone()).catch(() => {});
        return net;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error("offline, geen cache");
      }
    })());
    return;
  }

  // Same-origin: cache-first, fallback network
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const net = await fetch(request);
      if (net.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, net.clone()).catch(() => {});
      }
      return net;
    } catch (err) {
      // Fallback naar index voor navigatie
      if (request.mode === "navigate") {
        const index = await caches.match("./index.html");
        if (index) return index;
      }
      throw err;
    }
  })());
});
