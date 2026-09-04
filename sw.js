const CACHE = 'cartera-v8'; // v8: arranque instantaneo (stale-while-revalidate + SDK precacheado)
// El HTML y el SDK de Firebase se precachean: sin esto, en el telefono cada apertura
// esperaba a bajar ~94KB de HTML MAS los 3 modulos de gstatic antes de pintar nada.
const SDK = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
];
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    // el SDK es de otro origen: si falla (offline al instalar) NO debe tumbar la
    // instalacion entera, se recachea solo en el primer fetch que lo pida
    await Promise.allSettled(SDK.map(u => c.add(new Request(u, {mode:'cors'}))));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // solo borra caches propios (cartera-*) y toma control inmediato de las ventanas abiertas
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('cartera-') && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// avisa a la app que la copia recien bajada es distinta a la que se esta viendo
async function avisarVersionNueva() {
  const cs = await self.clients.matchAll({type:'window'});
  cs.forEach(c => c.postMessage({tipo:'version-nueva'}));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('yahoo.com') || req.url.includes('allorigins') || req.url.includes('corsproxy')) return;
  // Firestore/Auth hablan por su propio canal: NUNCA cachear sus llamadas
  if (req.url.includes('firestore.googleapis.com') || req.url.includes('identitytoolkit') ||
      req.url.includes('googleapis.com/identitytoolkit') || req.url.includes('firebaseinstallations')) return;

  // HTML: stale-while-revalidate. Antes era network-first, o sea que con red lenta la
  // app NO pintaba nada hasta bajar el HTML entero. Ahora se sirve al instante desde
  // cache y la version fresca se baja en segundo plano para la proxima apertura; si
  // cambio, se le avisa a la app para que ofrezca recargar.
  const isHTML = req.mode === 'navigate' || req.destination === 'document' ||
                 req.url.endsWith('/index.html') || req.url.endsWith('/');
  if (isHTML) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const red = fetch(req).then(async res => {
        if (res && res.ok) {
          const copia = res.clone();
          const nuevoTxt = await copia.clone().text();
          const viejoTxt = cached ? await cached.clone().text() : null;
          await cache.put('./index.html', copia);
          if (viejoTxt !== null && viejoTxt !== nuevoTxt) avisarVersionNueva();
        }
        return res;
      }).catch(() => null);
      // si hay copia guardada se responde YA; la red sigue corriendo en segundo plano
      if (cached) { e.waitUntil(red); return cached; }
      const res = await red;
      return res || new Response('sin conexion y sin copia guardada', {status:503});
    })());
    return;
  }

  // Resto (incluido el SDK de gstatic): cache-first, y lo que falte se guarda al vuelo
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && (req.url.startsWith(self.location.origin) || SDK.includes(req.url))) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return new Response('sin conexion', {status:503});
    }
  })());
});
