/* Offline for the published copy. Network-first so a new build lands as soon
   as there is a connection, cache fallback so the home-screen icon still
   opens in the car, at her grandmother's, or with the laptop switched off. */
const CACHE  = 'litery-v27';
const ASSETS = ['./', './index.html', './manifest.json',
                './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

/* only Litery's own old caches: the cache store belongs to the whole origin,
   and Pisz lives on the same one — deleting "everything not ours" deleted
   Pisz's offline copy every time Litery updated                          */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('litery-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
