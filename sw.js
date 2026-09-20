const CACHE = 'cuaderno-docente-v36';
const SHELL = ['./', './index.html', './app.js', './admin.js', './classroom.js', './chart.umd.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Si CUALQUIER archivo falla al descargarse, se aborta toda la instalación
      // (en vez de ignorar el error y quedarse con una copia a medias). Así el
      // navegador conserva la versión anterior, completa y funcional, hasta que
      // la nueva logre instalarse entera.
      await Promise.all(SHELL.map(async (url) => {
        const res = await fetch(url, { cache: 'reload' });
        if (!res.ok) throw new Error('No se pudo obtener ' + url);
        await c.put(url, res);
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nunca cachear llamadas a la API (Apps Script / JSONP) — siempre red o falla explícita
  if (url.hostname.includes('script.google.com')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (e.request.method === 'GET' && res.ok && url.origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
