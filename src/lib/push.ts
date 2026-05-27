import webpush from 'web-push';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@vegamate.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Missing VAPID environment variables (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)');
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushResult {
  success: boolean;
  endpoint: string;
  statusCode?: number;
  error?: string;
}

/**
 * Send a push notification to a single subscription.
 * Returns result with success/failure info (never throws).
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<PushResult> {
  try {
    ensureConfigured();

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const result = await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1 hour TTL
        urgency: 'normal',
      }
    );

    return {
      success: true,
      endpoint: subscription.endpoint,
      statusCode: result.statusCode,
    };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };

    // 410 Gone or 404 = subscription expired/invalid
    if (error.statusCode === 410 || error.statusCode === 404) {
      return {
        success: false,
        endpoint: subscription.endpoint,
        statusCode: error.statusCode,
        error: 'subscription_expired',
      };
    }

    return {
      success: false,
      endpoint: subscription.endpoint,
      statusCode: error.statusCode,
      error: error.message || 'Unknown push error',
    };
  }
}

/**
 * Send push to all subscriptions for a user.
 * Deactivates expired subscriptions automatically.
 * Returns count of successful sends.
 */
export async function sendPushToUser(
  subscriptions: PushSubscriptionData[],
  payload: PushPayload,
  onExpired?: (endpoint: string) => Promise<void>
): Promise<number> {
  let successCount = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const pushResult = result.value;
      if (pushResult.success) {
        successCount++;
      } else if (pushResult.error === 'subscription_expired' && onExpired) {
        // Fire-and-forget: deactivate expired subscription
        onExpired(pushResult.endpoint).catch(() => {});
      }
    }
  }

  return successCount;
}
