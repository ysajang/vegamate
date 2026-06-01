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

// Handle notification click -> open app to the right page
//
// Bug history: previously used client.navigate(url) on an existing tab. That
// triggers a full document load (not Next.js client-side routing). On the chat
// page the conversation lookup then runs before the auth session is ready and
// redirects the user to /select. This file (src/sw.ts) is the real source —
// @serwist/next compiles it to public/sw.js at build time, so editing
// public/sw.js directly is always overwritten on the next build (which is why
// earlier fixes appeared to do nothing).
//
// Fix:
//   1. Focus an existing same-origin tab and ask the app to SPA-navigate via
//      postMessage (the app listens and calls router.push) -> no reload, no race.
//   2. If no tab is open, openWindow(url) and await it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data?.url as string | undefined) || '/';
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const existing = clientList.find(
        (c) => c.url.startsWith(self.location.origin) && 'focus' in c
      );

      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', url: targetUrl });
        return;
      }

      const opened = await self.clients.openWindow(absoluteUrl);
      if (opened && 'focus' in opened) {
        await opened.focus();
      }
    })()
  );
});

serwist.addEventListeners();
