/**
 * PayPal server-side client factory.
 *
 * SDK: @paypal/paypal-server-sdk v2.3.0 (verified: includes OrdersController,
 * PaymentsController, SubscriptionsController). Webhook signature verification
 * is NOT in this SDK — step 4 uses the REST endpoint
 * POST /v1/notifications/verify-webhook-signature directly (see webhook route).
 *
 * Env (sandbox/live separated by PAYPAL_ENV — flipping env vars is the only
 * change needed for live cutover):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_ENV=sandbox|live
 *   PAYPAL_WEBHOOK_ID   (from Developer Dashboard after registering webhook URL)
 */
import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  SubscriptionsController,
} from '@paypal/paypal-server-sdk';

let _client: Client | null = null;

export function getPayPalEnv(): 'sandbox' | 'live' {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}

export function getPayPalApiBase(): string {
  return getPayPalEnv() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function getPayPalClient(): Client {
  if (_client) return _client;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)');
  }

  _client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: clientId,
      oAuthClientSecret: clientSecret,
    },
    environment: getPayPalEnv() === 'live' ? Environment.Production : Environment.Sandbox,
    timeout: 30000,
  });
  return _client;
}

export function getOrdersController(): OrdersController {
  return new OrdersController(getPayPalClient());
}

export function getPaymentsController(): PaymentsController {
  return new PaymentsController(getPayPalClient());
}

export function getSubscriptionsController(): SubscriptionsController {
  return new SubscriptionsController(getPayPalClient());
}

/**
 * Raw OAuth access token for REST endpoints the SDK doesn't cover
 * (webhook signature verification, plan creation if needed).
 */
export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PayPal OAuth failed: ${res.status} ${txt}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}
