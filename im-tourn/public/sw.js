// Keep only fingerprinted assets. Documents always come from the network so a
// deployment never pairs old HTML with new application code. An offline error
// for a script must never receive HTML as its response.
const CACHE = 'im-tourn-assets-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('im-tourn-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) await cache.put(request, response.clone());
    return response;
  })());
});
