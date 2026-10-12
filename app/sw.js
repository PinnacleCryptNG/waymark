// Offline support: always fetch the latest files when online, keep a copy for when offline.
const CACHE = 'waymark-v11';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './ui/app.js', './ui/screens.js', './ui/dom.js', './ui/store.js', './ui/haptics.js', './ui/biometric.js', './ui/icons.js', './ui/talk.js',
  './domain/money.js', './domain/spoken.js', './domain/transfer.js', './domain/ledger.js',
  './domain/directory.js', './domain/validation.js', './data/seed.js',
  './bank/bank-api.js', './bank/demo-bank.js', './bank/server-bank.js', './bank/transfer-client.js',
  './icons/mark.svg', './img/waves.svg', './icons/icon-192.png',
  './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  './voice/intent.js', './voice/dialog.js', './voice/interpreter.js', './voice/speech.js', './voice/assistant.js', './voice/gemini-interpreter.js', './voice/voice-auth.js', './voice/recorder.js', './config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, so a new version shows at once; the saved copy is used only when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) ?? Response.error();
    }
  }));
});
