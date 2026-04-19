var CACHE_NAME = 'notes-cache-v6'; // v6: skip external URLs
var urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app.js',
  './icon.png'
];

// Install event: cache initial assets
self.addEventListener('install', function(event) {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
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
        return self.clients.claim(); // Take control of all open clients immediately
    })
  );
});

// Fetch event: Network-First strategy with dynamic cache update
// CRITICAL: Only handle same-origin requests. External URLs (Google APIs,
// fonts, CDNs) must NOT be intercepted — the Service Worker re-issuing
// cross-origin requests with Authorization headers causes "Failed to fetch"
// errors on some devices/browsers.
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  // Skip all external (cross-origin) requests — let them go through normally
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    // Bypassa la cache HTTP del browser per forzare l'URL aggiornato dal server
    fetch(event.request, { cache: 'no-store' })
      .then(function(response) {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(function() {
        return caches.match(event.request);
      })
  );
});

// Message event: handle background sync when app is closing
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SYNC_ON_CLOSE') {
    var p = uploadToDrive(event.data.payload, event.data.token, event.data.fileId)
      .then(function() { console.log('SW: upload success'); })
      .catch(function(err) { console.error('SW: upload failed', err); });
      
    if (event.waitUntil) {
      event.waitUntil(p);
    }
  }
});

function uploadToDrive(data, token, driveFileId) {
  var jsonStr = JSON.stringify(data);
  var boundary = '---notesapp' + Date.now();

  var metadata = {
    name: 'notes_app_data.json',
    mimeType: 'application/json'
  };

  if (!driveFileId) {
    metadata.parents = ['appDataFolder'];
  }

  var body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    jsonStr + '\r\n' +
    '--' + boundary + '--';

  var url = driveFileId
    ? 'https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=multipart'
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  return fetch(url, {
    method: driveFileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: body
  }).then(function(res) {
    if (!res.ok) throw new Error('Status: ' + res.status);
    return res.json();
  });
}
