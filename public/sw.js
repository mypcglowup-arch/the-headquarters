// KILL-SWITCH SERVICE WORKER — runs once on browsers that still have the
// previous QG service worker registered, then commits suicide. The PWA layer
// has been removed from the project; this file exists solely so existing
// browsers can clean themselves up. Do NOT add caching logic here.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (e) { /* ignore */ }
    }
  })());
});

// Pass-through fetch — never serve from cache.
self.addEventListener('fetch', () => { /* no-op */ });
