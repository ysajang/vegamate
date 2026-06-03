#!/usr/bin/env node
/**
 * Create the VegaMate PayPal catalog product + billing plans via API.
 * No dashboard work needed. Run once per environment (sandbox, then live).
 *
 * Usage:
 *   PAYPAL_CLIENT_ID=xxx PAYPAL_CLIENT_SECRET=yyy PAYPAL_ENV=sandbox \
 *     node scripts/paypal-create-plans.mjs
 *
 * Output: plan IDs (P-...) to write into subscription_tiers.paypal_plan_id:
 *   UPDATE subscription_tiers SET paypal_plan_id = 'P-...' WHERE slug = 'deeper';
 *   UPDATE subscription_tiers SET paypal_plan_id = 'P-...' WHERE slug = 'lover';
 *
 * Plans (must match subscription_tiers seed):
 *   deeper  $9.99/month
 *   lover   $19.99/month
 */

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const ENV = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
const BASE =
  ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function createProduct(token) {
  const res = await fetch(`${BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `vegamate-product-${ENV}`, // idempotency key
    },
    body: JSON.stringify({
      name: 'VegaMate Membership',
      description: 'VegaMate AI companion membership',
      type: 'SERVICE',
      category: 'SOFTWARE',
      home_url: 'https://vegamate.com',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Product create failed: ${res.status} ${JSON.stringify(json)}`);
  return json.id;
}

async function createPlan(token, productId, { name, slug, price }) {
  const res = await fetch(`${BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `vegamate-plan-${slug}-${ENV}`, // idempotency key
    },
    body: JSON.stringify({
      product_id: productId,
      name,
      description: `${name} — monthly membership, auto-renews until cancelled`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // infinite until cancelled
          pricing_scheme: {
            fixed_price: { value: price, currency_code: 'USD' },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CANCEL',
        payment_failure_threshold: 2,
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Plan create failed (${slug}): ${res.status} ${JSON.stringify(json)}`);
  return json.id;
}

const token = await getToken();
console.log(`[${ENV}] OAuth OK`);

const productId = await createProduct(token);
console.log(`[${ENV}] Product: ${productId}`);

const deeperPlan = await createPlan(token, productId, {
  name: 'VegaMate Deeper',
  slug: 'deeper',
  price: '9.99',
});
console.log(`[${ENV}] Plan deeper: ${deeperPlan}`);

const loverPlan = await createPlan(token, productId, {
  name: 'VegaMate Lover',
  slug: 'lover',
  price: '19.99',
});
console.log(`[${ENV}] Plan lover: ${loverPlan}`);

console.log('\nSQL to apply:');
console.log(`UPDATE public.subscription_tiers SET paypal_plan_id = '${deeperPlan}' WHERE slug = 'deeper';`);
console.log(`UPDATE public.subscription_tiers SET paypal_plan_id = '${loverPlan}' WHERE slug = 'lover';`);
