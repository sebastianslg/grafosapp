/* Service worker: guarda la aplicación para abrirla sin conexión a internet y con más rapidez.
   Red primero (así siempre se usa la versión nueva) y, si no hay respuesta, la copia guardada.
   La API local (/api/...) y el caché de rutas (12 MB) no se guardan. Las teselas del mapa y los
   servicios de calles (OSRM, búsqueda) son de internet y no pasan por aquí. */
const VERSION = 'parcial-grafos-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'css/app.css',
  'vendor/leaflet.css', 'vendor/leaflet.js', 'vendor/highs.js', 'vendor/highs.wasm',
  'js/solver.js', 'js/datos.js', 'js/mapa.js', 'js/app.js', 'js/variantes.js', 'js/heur.js', 'js/gams.js',
  'js/simulacion.js', 'js/graficas.js', 'js/modelos.js', 'js/vrpui.js', 'js/edicion.js', 'js/capas.js',
  'js/ubicacion.js', 'js/proyectos.js', 'js/vrp.js', 'js/worker.js', 'datos/cali.json', 'datos/china.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname === '/datos/cache_rutas.json') return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
