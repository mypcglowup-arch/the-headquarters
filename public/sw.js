/**
 * The Headquarters — Service Worker
 *
 * Scope:
 *   - Cache the app shell for offline first-paint
 *   - Handle notification clicks (focus/open a window)
 *   - Host `showNotification` for the in-app gmail watcher
 *
 * NOT in scope (browser-limited):
 *   - Background polling when the tab is fully closed is NOT reliably
 *     supported across browsers. Periodic Background Sync works only on
 *     Chrome for installed PWAs with a 12h minimum interval. True 5-min
 *     background polling requires a backend cron that sends push messages.
 */

const CACHE_VERSION = 'qg-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

// ─── Install: prefetch the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] app-shell prefetch partial:', err?.message);
      })
    )
  );
});

// ─── Activate: purge old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first for navigations, cache-first for static ──────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept API calls to Anthropic / Mem0 / Supabase / Google / Mem0 proxy
  const bypassHosts = [
    'api.anthropic.com',
    'api.mem0.ai',
    'supabase.co',
    'googleapis.com',
    'accounts.google.com',
  ];
  if (bypassHosts.some((h) => url.hostname.includes(h))) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests — network-first so new deploys ship fresh HTML
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets — cache-first, update in background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ─── Notification click: focus or open the app ──────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing QG window if open
    for (const client of allClients) {
      if (client.url && 'focus' in client) return client.focus();
    }
    // Otherwise open a new one
    if (self.clients.openWindow) return self.clients.openWindow('/');
  })());
});

// ─── Message channel — let the page tell the SW to show a notification ─────
// We don't get real web-push without a backend server, but the page can
// delegate `showNotification` to the SW registration for a consistent API.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const { title, body, tag, data } = event.data;
  self.registration.showNotification(title || 'QG', {
    body:    body || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    tag:     tag || 'qg-alert',
    data:    data || {},
    renotify: true,
  });
});
