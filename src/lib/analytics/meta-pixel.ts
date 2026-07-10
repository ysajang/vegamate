/**
 * Meta (Facebook) Pixel — client-side tracking helper.
 *
 * Design:
 * - No-op when NEXT_PUBLIC_META_PIXEL_ID is unset (safe to ship before the
 *   pixel exists; nothing fires, no errors).
 * - No-op on localhost / non-production to avoid polluting ad data.
 * - All calls guarded so a missing/blocked fbq (ad blockers) never throws.
 *
 * Standard events mapped to the VegaMate funnel (Notion §25):
 *   PageView             → every route change (SPA)
 *   CompleteRegistration → onboarding finished (signup)
 *   Lead                 → first user message in a session (activation)
 *   InitiateCheckout     → gift card tapped → redirected to PayPal
 *   Purchase             → server-side via CAPI (separate step, not here)
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

/** Whether the pixel should actually fire in this environment. */
export function pixelEnabled(): boolean {
  if (!META_PIXEL_ID) return false;
  if (typeof window === 'undefined') return false;
  // Don't fire on localhost / preview hosts — only real production traffic.
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return false;
  }
  return true;
}

/**
 * Inject the base pixel snippet + initial PageView exactly once.
 * Idempotent: subsequent calls are ignored (window.fbq already present).
 */
export function initMetaPixel(): void {
  if (!pixelEnabled()) return;
  if (typeof window.fbq === 'function') return; // already initialized

  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    let n: any;
    let t: HTMLScriptElement;
    let s: Element | null;
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s?.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  const fbq = (window as { fbq?: (...args: unknown[]) => void }).fbq;
  fbq?.('init', META_PIXEL_ID);
  fbq?.('track', 'PageView');
}

/** Track a standard PageView (used on SPA route changes). */
export function trackPageView(): void {
  const fbq = window.fbq;
  if (!pixelEnabled() || !fbq) return;
  fbq('track', 'PageView');
}

/** Track a standard Meta event with optional params. */
export function trackEvent(
  event: 'CompleteRegistration' | 'Lead' | 'InitiateCheckout' | 'Purchase',
  params?: Record<string, unknown>,
): void {
  if (!pixelEnabled()) return;
  // Self-heal: React runs CHILD (page) effects before the root layout's
  // PixelProvider effect, so an event fired in an early page effect can land
  // before the fbq stub exists — the old `if (!fbq) return` silently dropped
  // it. Stub creation is synchronous, so initializing here guarantees a queue
  // that fbevents.js flushes once loaded; ordering can never drop an event.
  if (!window.fbq) {
    initMetaPixel();
  }
  const fbq = window.fbq;
  if (!fbq) return; // init itself refused (disabled env) — nothing to do
  if (params) {
    fbq('track', event, params);
  } else {
    fbq('track', event);
  }
}
