'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { captureUtmFromSearch } from '@/lib/analytics/funnel';
import { captureDirectCharFromSearch } from '@/lib/onboarding/direct-entry';

/**
 * Captures utm_* params and the direct-character `c` param from the URL into
 * localStorage (first-touch) so funnel events carry ad attribution and new
 * signups route to the advertised character (Notion §34).
 *
 * Mounted in the root layout: the landing page renders inside it, so ad
 * landings are captured without touching the landing page itself. Renders
 * nothing; re-checks on every navigation but first-touch storage makes
 * repeat calls no-ops.
 */
export function UtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
    captureUtmFromSearch(search);
    captureDirectCharFromSearch(search);
  }, [searchParams]);

  return null;
}
