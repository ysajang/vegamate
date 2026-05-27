'use client';

import { usePushAndTimezone } from '@/hooks/use-push';

/**
 * Client component that initializes push notifications and timezone sync.
 * Renders nothing visible -> purely side-effect component.
 */
export function AppInitializer() {
  usePushAndTimezone();
  return null;
}
