// NOTE: This service worker is intentionally minimal and avoids long-lived
// caching of HTML, JSON, and JS so that new deployments are picked up quickly.

const CACHE_NAME = 'mh-directory-v7';

// Precache list kept empty so we never pin stale copies of app shells.
const urlsToCache = [];

function isCacheableStaticAsset(url) {
  const p = url.pathname.toLowerCase();
  // Never cache dynamic data or executable content
  if (p.endsWith('.html') || p.endsWith('.htm')) return false;
  if (p.endsWith('.js') || p.endsWith('.json')) return false;
  if (p.endsWith('.css')) return false;
  // Fonts and images only — safe offline fallbacks without trapping stale app logic
  return /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|svg|ico|avif)$/.test(p);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(() =>
        fetch(event.request).then((response) => {
          if (
            response.status === 200 &&
            response.type === 'basic' &&
            isCacheableStaticAsset(url)
          ) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => caches.match(event.request))
      )
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});
