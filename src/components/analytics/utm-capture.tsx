'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { captureUtmFromSearch } from '@/lib/analytics/funnel';

/**
 * Captures utm_* params from the URL into localStorage (first-touch) so the
 * funnel events fired after signup can carry ad attribution (Notion §34).
 *
 * Mounted in the root layout: the landing page renders inside it, so ad
 * landings are captured without touching the landing page itself. Renders
 * nothing; re-checks on every navigation but first-touch storage makes
 * repeat calls no-ops.
 */
export function UtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    captureUtmFromSearch(searchParams.toString() ? `?${searchParams.toString()}` : '');
  }, [searchParams]);

  return null;
}
