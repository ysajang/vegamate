'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const SW_PATH = '/sw.js';
const SW_REGISTER_TIMEOUT = 5000; // 5 seconds

/**
 * Hook that handles:
 * 1. Service worker registration
 * 2. Push notification permission + subscription registration
 * 3. Timezone detection and sync to profile
 * 4. SW -> app navigation messages (notification clicks do SPA routing,
 *    avoiding a full reload that would race the auth session and bounce
 *    the user to /select).
 *
 * Call once in the authenticated app layout.
 * Runs only on mount. Safe to call multiple times (idempotent).
 */
export function usePushAndTimezone() {
  const initialized = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Run both in parallel, non-blocking
    syncTimezone().catch(() => {});
    initPush().catch(() => {});
  }, []);

  // Listen for navigation requests posted by the service worker on
  // notification click. Using router.push keeps it client-side (no reload),
  // so the chat page mounts with the auth session already in place.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'navigate' && typeof data.url === 'string') {
        router.push(data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [router]);
}

/**
 * Detect user timezone and send to server.
 */
async function syncTimezone(): Promise<void> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;

    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });
  } catch {
    // Non-critical -> silently fail
  }
}

/**
 * Register SW manually then set up push subscription.
 */
async function initPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return;
  }

  try {
    // 1. Register or get existing SW
    let registration = await navigator.serviceWorker.getRegistration(SW_PATH);

    if (!registration) {
      // Try to register - if sw.js doesn't exist (404), this will fail gracefully
      try {
        registration = await navigator.serviceWorker.register(SW_PATH, {
          scope: '/',
        });
        console.log('[Push] Service worker registered');
      } catch (regErr) {
        console.warn('[Push] SW registration failed (sw.js may not exist):', regErr);
        // Fallback: try to use any existing SW (Serwist might register under different path)
        registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration) {
          console.warn('[Push] No service worker available');
          return;
        }
      }
    }

    // 2. Wait for SW to be active (with timeout)
    if (registration.installing || registration.waiting) {
      await waitForActive(registration);
    }

    if (!registration.active) {
      console.warn('[Push] Service worker not active');
      return;
    }

    // 3. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Permission denied');
      return;
    }

    // 4. Get or create push subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
    }

    // 5. Send to server
    const rawKeys = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = rawKeys.keys?.p256dh;
    const auth = rawKeys.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      console.warn('[Push] Incomplete subscription data');
      return;
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, p256dh, auth }),
    });

    console.log('[Push] Subscription registered successfully');
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
  }
}

/**
 * Wait for a service worker registration to become active.
 */
function waitForActive(registration: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve) => {
    const sw = registration.installing || registration.waiting;
    if (!sw) {
      resolve();
      return;
    }

    // Timeout safety
    const timeout = setTimeout(() => resolve(), SW_REGISTER_TIMEOUT);

    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}
