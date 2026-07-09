import { GIFT_SLUGS, type GiftSlug } from '@/config/constants';

export interface GiftMarkerResult {
  /**
   * The gift slug extracted from [GIFT:slug]. Null when the marker's slug is
   * unknown and unrecoverable — the caller's fallback pool decides the card,
   * but the marker text is STILL stripped from the visible content.
   */
  giftSlug: GiftSlug | null;
  /** AI response content with ALL gift-shaped markers removed. */
  cleanContent: string;
}

/**
 * Any [GIFT:...]-shaped marker, valid or not. Tolerant of case, spaces, and
 * hyphens inside the slug — the model occasionally writes "[GIFT: Milk Tea]".
 */
const GIFT_MARKER_RE = /\[GIFT:\s*([\w -]+?)\s*\]/gi;

/** Lowercase + drop separators so 'Milk Tea' / 'milk-tea' → 'milktea'. */
function normalizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]+/g, '');
}

/** Levenshtein distance ≤ 1 check (insert/delete/substitute one char). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  // Ensure a is the shorter (or equal) string.
  if (la > lb) return withinOneEdit(b, a);
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la === lb) i++; // substitution
    j++; // insertion into a / skip in b
  }
  return edits + (lb - j) + (la - i) <= 1;
}

/**
 * Resolve a raw marker slug to a known GiftSlug.
 * Exact match after normalization, then a single-character typo recovery
 * (prod: '[GIFT:milltea]' → 'milktea'). The known slugs are pairwise ≥2 edits
 * apart, so distance-1 recovery is unambiguous.
 */
function resolveSlug(raw: string): GiftSlug | null {
  const norm = normalizeSlug(raw);
  if (GIFT_SLUGS.includes(norm as GiftSlug)) return norm as GiftSlug;
  const recovered = GIFT_SLUGS.find((s) => withinOneEdit(norm, s));
  return recovered ?? null;
}

/**
 * Parse [GIFT:type] marker from AI response.
 * Returns null ONLY when no gift-shaped marker exists at all.
 *
 * Prod bug this rewrite fixes (screenshot 2026-07-09): the old version
 * returned null for unknown slugs WITHOUT stripping, so a typo'd
 * "[GIFT:milltea]" rendered raw inside the chat bubble. Markers are protocol,
 * never content — they must always be removed from the visible text.
 *
 * Examples:
 *   "커피 마시고 싶다 [GIFT:coffee]"  → { giftSlug: 'coffee',  cleanContent: '커피 마시고 싶다' }
 *   "밀크티 사줘 [GIFT:milltea]"      → { giftSlug: 'milktea', cleanContent: '밀크티 사줘' }  (typo recovered)
 *   "hey [GIFT:spaceship]"           → { giftSlug: null,      cleanContent: 'hey' }
 *   "오늘 뭐해?"                      → null
 */
export function parseGiftMarker(content: string): GiftMarkerResult | null {
  GIFT_MARKER_RE.lastIndex = 0;
  const matches = [...content.matchAll(GIFT_MARKER_RE)];
  if (matches.length === 0) return null;

  // First resolvable slug wins; strip every gift-shaped marker regardless.
  let giftSlug: GiftSlug | null = null;
  for (const m of matches) {
    const resolved = resolveSlug(m[1]);
    if (resolved) {
      giftSlug = resolved;
      break;
    }
  }

  const cleanContent = content.replace(GIFT_MARKER_RE, '').trim();
  return { giftSlug, cleanContent };
}
