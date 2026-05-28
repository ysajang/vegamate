import { GIFT_SLUGS, type GiftSlug } from '@/config/constants';

export interface GiftMarkerResult {
  /** The gift slug extracted from [GIFT:slug] */
  giftSlug: GiftSlug;
  /** AI response content with the marker removed */
  cleanContent: string;
}

/**
 * Parse [GIFT:type] marker from AI response.
 * Returns null if no valid marker found.
 *
 * Examples:
 *   "커피 마시고 싶다 [GIFT:coffee]" -> { giftSlug: 'coffee', cleanContent: '커피 마시고 싶다' }
 *   "오늘 뭐해?" -> null
 */
export function parseGiftMarker(content: string): GiftMarkerResult | null {
  const markerRegex = /\[GIFT:(\w+)\]/i;
  const match = content.match(markerRegex);

  if (!match) return null;

  const rawSlug = match[1].toLowerCase();

  // Validate against known gift slugs
  if (!GIFT_SLUGS.includes(rawSlug as GiftSlug)) {
    // Unknown gift slug — strip marker but don't return gift
    return null;
  }

  const giftSlug = rawSlug as GiftSlug;
  const cleanContent = content.replace(markerRegex, '').trim();

  return { giftSlug, cleanContent };
}
