const CACHE = 'cartera-v2';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.url.includes('yahoo.com') || req.url.includes('allorigins') || req.url.includes('corsproxy')) return;

  // Para el HTML de la app: network-first (siempre busca la version fresca; usa cache solo si no hay internet)
  const isHTML = req.mode === 'navigate' || req.destination === 'document' || req.url.endsWith('/index.html') || req.url.endsWith('/');
  if (isHTML) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('/index.html', copy));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Resto de assets: cache-first
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
