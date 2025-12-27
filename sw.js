const CACHE_NAME = 'mh-directory-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/programs.json',
  '/security.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache same-origin requests
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return; // Don't cache external resources
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - validate response
        if (response) {
          // Verify response is for expected resource
          const requestUrl = new URL(event.request.url);
          const allowedPaths = ['/', '/index.html', '/styles.css', '/app.js', '/programs.json', '/security.js'];
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
    })
  );
});