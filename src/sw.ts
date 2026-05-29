import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkOnly } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Override: force NetworkOnly for ALL /api/ routes.
// defaultCache ships a NetworkFirst rule for /api/ GET requests which
// caches responses for up to 24 hours. For a chat app this causes
// stale messages when switching between devices/tabs.
const runtimeCaching: RuntimeCaching[] = [
  // Our override — must come BEFORE the defaultCache entries
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  // Keep everything else from the default set
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options: NotificationOptions = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'vegamate-notification',
      data: {
        url: data.url || '/',
      },
    };

    event.waitUntil(self.registration.showNotification(data.title || 'VegaMate', options));
  } catch {
    // Fallback for plain text push
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('VegaMate', {
        body: text,
        icon: '/icon-192.png',
      })
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

serwist.addEventListeners();
