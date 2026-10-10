// Offline support: cache the static files, serve from cache, refresh the cache in the background.
const CACHE = 'waymark-v1';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './ui/app.js', './ui/screens.js', './ui/dom.js', './ui/store.js', './ui/haptics.js',
  './domain/money.js', './domain/spoken.js', './domain/transfer.js', './domain/ledger.js',
  './domain/directory.js', './domain/validation.js', './data/seed.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request)
      .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
      .catch(() => cached);
    return cached ?? network;
  }));
});
