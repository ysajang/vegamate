'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initMetaPixel, trackPageView } from '@/lib/analytics/meta-pixel';

/**
 * Mounts the Meta Pixel once and fires a PageView on every SPA route change.
 *
 * Next.js App Router does NOT do a full page reload between routes, so the
 * base snippet's one-time PageView would miss every client-side navigation.
 * We watch pathname + search params and re-fire PageView accordingly.
 *
 * Renders nothing. Safe to mount even when the pixel ID is unset (no-op).
 */
export function PixelProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize the pixel once on mount.
  useEffect(() => {
    initMetaPixel();
  }, []);

  // Fire PageView on every route change (after the first init PageView).
  useEffect(() => {
    trackPageView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}
