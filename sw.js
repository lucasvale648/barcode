const CACHE_NAME = 'scanner-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
];

// Arquivos do app sempre buscam na rede primeiro — garante código atualizado
const APP_FILES = ['/app.js', '/app.css', '/index.html', '/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // APIs: sempre rede
  if (
    url.hostname.includes('openfoodfacts') ||
    url.hostname.includes('openproductsfacts') ||
    url.hostname.includes('cosmos.bluesoft') ||
    url.hostname.includes('jsdelivr')
  ) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ status: 0, error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Arquivos do app: network-first, cache como fallback offline
  if (APP_FILES.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Demais assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
