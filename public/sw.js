const CACHE_NAME = 'mvp-ledger-pwa-v6';
const PRE_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/ledger-book-icon.jpg'
];

// Service Worker Installation: Pre-cache essential app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core PWA shell assets and frosted glass ledger book icons');
      return cache.addAll(PRE_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Service Worker Activation: Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache version:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interception: Stale-While-Revalidate caching for static assets & offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip cross-origin API calls (like Google Workspace, Firebase, etc.)
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Exclude API paths and development modules from service worker cache
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/@vite') ||
    event.request.url.includes('/@fs') ||
    event.request.url.includes('/src/') ||
    event.request.url.includes('?t=') ||
    event.request.url.includes('?v=')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('[SW] Offline network fetch failed:', err);
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Background Task: Background Sync Event for offline transaction synchronization
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-transactions') {
    console.log('[SW] Background Task: Syncing offline transactions queue...');
    event.waitUntil(
      // Trigger background sync processing
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
        });
      })
    );
  }
});

// Background Task: Push Notification received
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.text() : 'MVP Ledger Update';
  const options = {
    body: payload,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { dateOfArrival: Date.now() },
    actions: [
      { action: 'open', title: 'Open Ledger' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('MVP Ledger Book', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
