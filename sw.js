const CACHE = 'cuaderno-docente-v10';
const SHELL = ['./', './index.html', './app.js', './admin.js', './classroom.js', './chart.umd.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Se fuerza {cache:'reload'} para ignorar la caché HTTP del navegador
      // y traer siempre bytes frescos del servidor al actualizar versión.
      await Promise.all(SHELL.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) await c.put(url, res);
        } catch (err) { /* si un archivo falla no se detiene toda la instalación */ }
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
