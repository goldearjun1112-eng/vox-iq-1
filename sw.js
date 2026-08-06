const CACHE_PREFIX = 'voxiq-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Only clean up OLD VERSIONS of this app's own shell cache (voxiq-shell-*).
  // Never touch caches with other names/prefixes — in particular, Transformers.js
  // stores the ~300MB on-device model under its own cache name, and deleting
  // it here would silently force a re-download every time this SW updates.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let everything else (there isn't much) go straight to network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin requests are never handled by this service worker — that includes
  // Google Fonts, the jsdelivr CDN (Transformers.js library), and the Hugging Face /
  // jsdelivr-hosted model weight files. The model files are large binary shards that
  // Transformers.js caches itself via the Cache Storage API under its own cache name;
  // this SW deliberately stays out of the way rather than trying to manage them.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // Navigations: try the network first so the app is always fresh when online,
  // fall back to the cached shell, then to the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // Same-origin static assets: cache-first, fall back to network.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
