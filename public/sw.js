// VegaMate Push Service Worker
// This is a standalone SW for push notifications - no build step needed.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'vegamate-notification',
      data: {
        url: data.url || '/',
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'VegaMate', options)
    );
  } catch (e) {
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
// NOTE: This standalone file is the SW that actually ships (use-push.ts
// registers '/sw.js' directly; the Serwist src/sw.ts is not used by the
// current Turbopack build). Previously this used client.navigate(url) on an
// existing tab, which forces a full document load instead of Next.js
// client-side routing. On the chat page the conversation lookup then runs
// before the auth session is ready and bounces the user to /select. Fix:
// focus the existing tab and post a 'navigate' message so the app does SPA
// routing (router.push); only openWindow when no tab is open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
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
