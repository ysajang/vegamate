/**
 * Payment provider switch.
 *
 * Creem store was rejected, so PayPal is the active provider. Creem code is
 * intentionally kept in place (routes under /api/webhooks/creem etc.) so a
 * future provider (IAP / another PSP) can be added behind this same switch
 * without rework. Only routes should branch on this — business logic
 * (guards, intent log, hearts crediting, subscription mirroring) stays
 * provider-agnostic.
 */

export type PaymentProvider = 'paypal' | 'creem';

export function getActiveProvider(): PaymentProvider {
  const p = (process.env.PAYMENT_PROVIDER || 'paypal').toLowerCase();
  if (p === 'creem') return 'creem';
  return 'paypal';
}

export function isPayPalActive(): boolean {
  return getActiveProvider() === 'paypal';
}
