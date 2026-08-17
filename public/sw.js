/**
 * Offline-first service worker. The app shell + core schedule must render
 * with no network (directly fixing the old Straxis app's server dependence).
 * Strategy:
 *   - Navigations: network-first, falling back to cache — a new deploy shows
 *     up on the next refresh instead of pinning a stale page forever.
 *   - Static assets (hash-named): cache-first, with background refresh.
 *   - Everything else: network-first, falling back to cache.
 * Schedule logic itself is 100% on-device, so the app is fully usable offline.
 */
// Bump this on every deploy that must reach phones immediately: activate()
// deletes any cache whose name differs, flushing stale pages.
const CACHE = 'smchs-shell-v21';
const PRECACHE = ['/', '/manifest.webmanifest', '/logos/sm-logo.svg', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin

  const isNav = request.mode === 'navigate';
  const isAsset = /\.(?:js|css|svg|png|webmanifest|woff2?|ico)$/.test(url.pathname);

  if (isNav) {
    // Network-first: fresh page when online, cached page when offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (isAsset) {
    // Cache-first with background refresh.
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Network-first fallback to cache.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// Web Push: the server sends { title, body, url, tag } (schedule changes).
// Always show something; on iOS a push that shows no notification costs the
// app its push permission after a few silent ones.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // non-JSON push: fall through to the generic notification
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'SMCHS', {
      body: data.body || 'Something changed. Open the app for details.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'smchs',
      // Without renotify, a second notification reusing a tag replaces the
      // first SILENTLY — an afternoon correction to a morning schedule change
      // would arrive with no sound or vibration.
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => 'focus' in w);
      if (!open) return self.clients.openWindow(url);
      // Focusing alone left the user wherever they already were; take them to
      // what the notification was about.
      return open.navigate ? open.navigate(url).then((w) => (w || open).focus()) : open.focus();
    }),
  );
});

// Browsers rotate push endpoints on their own (key refresh, storage eviction).
// With no handler the device goes silent and the server only finds out on the
// NEXT broadcast — so that one is already lost, and nothing re-registers it.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push/key');
        if (!res.ok) return;
        const { key } = await res.json();
        const b64 = (key + '='.repeat((4 - (key.length % 4)) % 4))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // offline: the next enable/open re-registers
      }
    })(),
  );
});
