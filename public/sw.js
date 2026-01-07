// NOTE: This service worker is intentionally minimal and avoids long-lived
// caching of HTML and JS so that new deployments are picked up immediately
// for all users without requiring a hard refresh.

const CACHE_NAME = 'mh-directory-v6';

// Only cache truly static assets that rarely change (e.g., CSS).
// HTML and JS are intentionally excluded so that each deployment
// is fetched fresh from the network.
// Note: CSS is now versioned (styles.css?v=2) so cache updates automatically
const urlsToCache = [
  // CSS is versioned, so we don't need to cache it here
  // This ensures CSS updates are picked up immediately
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
        // Always check network first for CSS (since it's now versioned)
        // This ensures CSS updates are picked up immediately
        return fetch(event.request).then(response => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request);
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