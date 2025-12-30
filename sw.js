// NOTE: This service worker is intentionally minimal and avoids long-lived
// caching of HTML and JS so that new deployments are picked up immediately
// for all users without requiring a hard refresh.

const CACHE_NAME = 'mh-directory-v5';

// Only cache truly static assets that rarely change (e.g., CSS).
// HTML and JS are intentionally excluded so that each deployment
// is fetched fresh from the network.
const urlsToCache = [
  '/styles.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => {
        // Activate the new service worker immediately so users
        // get the latest deployment without needing a hard refresh.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache same-origin requests
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return; // Don't cache external resources
  }

  // For navigation requests (HTML), always go to the network so that
  // new deployments are picked up immediately.
  if (event.request.mode === 'navigate') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - validate response
        if (response) {
          // Verify response is for expected resource.
          // Only serve from cache for known static assets (currently CSS).
          const requestUrl = new URL(event.request.url);
          const allowedPaths = ['/styles.css'];
          if (allowedPaths.some(path => requestUrl.pathname === path || requestUrl.pathname.endsWith(path))) {
            return response;
          }
        }
        // Fetch and cache
        return fetch(event.request).then(response => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      }
    )
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Force clients to reload to get fresh files
      return self.clients.claim();
    })
  );
});