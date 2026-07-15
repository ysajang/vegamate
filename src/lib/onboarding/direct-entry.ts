/**
 * Direct-entry routing for new signups (Notion §34, round 3).
 *
 * Measured: 6/11 ad signups churned between signup and first message; the
 * 4-character picker sits exactly in that gap while every ad features a
 * single character. New signups now skip the picker and land directly in a
 * chat room.
 *
 * The direct character is PARAMETERIZED, not hardcoded: the ad's landing URL
 * may carry `?c=<slug>` (captured first-touch, like UTM). This keeps the
 * "ad character = first experience" invariant across campaigns — e.g. a
 * female-targeted campaign can route to leo/ren by URL alone, no deploy.
 * Fallback order: stored slug → miku → first active character.
 *
 * The /select page is untouched — character switching stays available from
 * normal navigation; only the mandatory new-signup path skips it.
 */

import type { UtmStorage } from '@/lib/analytics/funnel';

export const DIRECT_CHAR_STORAGE_KEY = 'vm_direct_char';
export const DEFAULT_DIRECT_CHARACTER_SLUG = 'miku';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Extract and validate the `c` (direct character) param from a query string. */
export function parseDirectCharSlug(search: string): string | null {
  const raw = new URLSearchParams(search).get('c');
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

function safeStorage(): UtmStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** First-touch capture of the direct-character slug, mirroring UTM capture. */
export function captureDirectCharFromSearch(
  search: string,
  storage: UtmStorage | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    if (storage.getItem(DIRECT_CHAR_STORAGE_KEY)) return; // first-touch wins
    const slug = parseDirectCharSlug(search);
    if (!slug) return;
    storage.setItem(DIRECT_CHAR_STORAGE_KEY, slug);
  } catch {
    // Tracking-adjacent code never throws.
  }
}

export function getStoredDirectChar(
  storage: UtmStorage | null = safeStorage(),
): string | null {
  if (!storage) return null;
  try {
    const slug = storage.getItem(DIRECT_CHAR_STORAGE_KEY);
    return slug && SLUG_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Resolve which character a new signup is routed to.
 * Order: stored ad slug → default (miku) → first available.
 * Returns null only when the character list is empty (caller falls back to
 * the picker rather than dead-ending).
 */
export function resolveDirectCharacter<T extends { slug: string }>(
  storedSlug: string | null,
  characters: readonly T[],
): T | null {
  if (characters.length === 0) return null;
  if (storedSlug) {
    const fromAd = characters.find((c) => c.slug === storedSlug);
    if (fromAd) return fromAd;
  }
  const fallback = characters.find(
    (c) => c.slug === DEFAULT_DIRECT_CHARACTER_SLUG,
  );
  return fallback ?? characters[0];
}
