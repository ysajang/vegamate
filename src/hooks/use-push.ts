'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook that handles:
 * 1. Push notification permission + subscription registration
 * 2. Timezone detection and sync to profile
 *
 * Call once in the authenticated app layout.
 * Runs only on mount. Safe to call multiple times (idempotent).
 */
export function usePushAndTimezone() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Run both in parallel, non-blocking
    syncTimezone().catch(() => {});
    registerPushSubscription().catch(() => {});
  }, []);
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
 * Request notification permission and register push subscription.
 */
async function registerPushSubscription(): Promise<void> {
  // Check browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  // Check VAPID key
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return;
  }

  try {
    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      // Subscribe
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
    }

    // Extract keys
    const rawKeys = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = rawKeys.keys?.p256dh;
    const auth = rawKeys.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      console.warn('[Push] Incomplete subscription data');
      return;
    }

    // Send to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, p256dh, auth }),
    });
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
  }
}
