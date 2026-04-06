var CACHE_NAME = 'onpoint-cache-v3';
var urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app.js',
  './Sortable.min.js',
  './icon.png'
];

// Install event: cache initial assets
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: cleanup old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch event: Network-First strategy with dynamic cache update
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    // Bypassa la cache HTTP del browser per essere certi di avere l'ultima versione dal server
    fetch(event.request, { cache: 'no-store' })
      .then(function(response) {
        // Se la chiamata ha successo, aggiorna la memoria del service worker
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(function() {
        // Fallisce e usa la cache solo se c'è assenza di rete
        return caches.match(event.request);
      })
  );
});
