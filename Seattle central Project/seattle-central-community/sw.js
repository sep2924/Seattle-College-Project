// Minimal service worker: exists so the site is installable as a PWA
// ("Add to Home Screen"), not to aggressively cache the app.
//
// Strategy: network-first. Every request tries the network first so you
// always get the latest deploy; only if the network fails (offline) do we
// fall back to whatever's in the cache. This avoids the classic PWA bug
// where a cache-first service worker serves stale HTML/JS forever and
// "the site won't update" until someone manually clears storage.
//
// Bump CACHE_NAME whenever you want to force old caches out.
const CACHE_NAME = 'scc-shell-v1';
const APP_SHELL = [
  './index.html',
  './style.css',
  './script.js',
  './store.js',
  './config.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // never cache writes
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
