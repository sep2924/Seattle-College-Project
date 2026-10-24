// Minimal service worker: exists so the site is installable as a PWA
// ("Add to Home Screen"), not to aggressively cache the app.
//
// Strategy: network-first for this site's own files only. Every request tries
// the network first so you always get the latest deploy; only if the network
// fails (offline) do we fall back to the cached copy. Requests to other sites
// (Supabase, fonts, CDN) are never touched, so data is always live.
//
// Bump CACHE_NAME whenever you want to force old caches out.
const CACHE_NAME = 'scc-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './js/store.js',
  './js/subjects.js',
  './js/courses.js',
  './js/instructors.js',
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
  const req = event.request;
  if (req.method !== 'GET') return;                       // never cache writes
  if (new URL(req.url).origin !== self.location.origin) return; // leave Supabase/CDN alone
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
