const CACHE_NAME = 'auvasa-app-v9';

const PRECACHE = ["./", "index.html", "styles.css", "gtfs.css", "main.js", "gtfs.js", "buses.js", "buses.css", "manifest.json", "icon-192.png", "icon-512.png", "./horarios_buho.json?v=4", "./horarios_futbol.json?v=4", "./horarios_lanzaderas.json?v=4", "./horarios_madrugada.json?v=4", "./horarios_manual.json?v=4", "./horarios_ordinarias.json?v=4", "./horarios_personal.json?v=4"];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;
  // Live data (proxy, map tiles, other sites) must never come from this cache: only our own files and the libraries/fonts we use
  const u = new URL(event.request.url);
  if (u.origin !== location.origin && !/(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(res => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('{"lineas": []}', { status: 200, headers: {'Content-Type': 'application/json'} });
    })
  );
});