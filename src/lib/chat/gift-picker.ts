/**
 * Stage-aware gift picker (monetization).
 *
 * Strategy (wealth-max, mirrors the human upsell instinct):
 *   - Early stages ask for CHEAP gifts to clear the first-purchase barrier.
 *   - As intimacy grows ("우리 사이에..."), the requestable pool widens upward
 *     to premium gifts, so good payers are gently led to higher-value items.
 *   - Cheaper gifts always stay in higher-stage pools, so the ask still varies
 *     and never forces an expensive item every time (kills conversion).
 *
 * Hard rules:
 *   - `ring` (is_requestable=false) is NEVER asked for — the user discovers it.
 *   - `surprise` (no hearts_value) is never a beg target.
 *
 * Prices mirror migration 005 (public.gifts). Kept here as a small static map
 * so this stays a pure, unit-testable function with no DB round-trip on the
 * hot chat path. If migration 005 prices change, update this map too.
 */

export type RequestableGiftSlug =
  | 'coffee'
  | 'milktea'
  | 'cake'
  | 'book'
  | 'movie'
  | 'flowers'
  | 'plushie'
  | 'clothes'
  | 'airpods'
  | 'dinner';

interface GiftMeta {
  price: number;
}

/** Requestable gifts only (ring/surprise excluded by design). */
export const REQUESTABLE_GIFTS: Record<RequestableGiftSlug, GiftMeta> = {
  coffee: { price: 0.99 },
  milktea: { price: 0.99 },
  cake: { price: 1.99 },
  book: { price: 2.99 },
  movie: { price: 2.99 },
  flowers: { price: 4.99 },
  plushie: { price: 4.99 },
  clothes: { price: 9.99 },
  airpods: { price: 9.99 },
  dinner: { price: 14.99 },
};

const LOW = ['coffee', 'milktea', 'cake', 'book', 'movie'] as const; // 0.99–2.99
const MID = ['flowers', 'plushie'] as const; // 4.99
const HIGH = ['clothes', 'airpods'] as const; // 9.99
const PREMIUM = ['dinner'] as const; // 14.99

/**
 * Stage → cumulative requestable pool. Higher stages keep the lower tiers so
 * the ask varies; they just unlock progressively pricier options on top.
 *   0 stranger / 1 acquaintance → LOW only (first-purchase floor)
 *   2 close                     → LOW + MID
 *   3 trusted                   → LOW + MID + HIGH
 *   4 devoted                   → LOW + MID + HIGH + PREMIUM
 */
export function giftPoolForStage(stage: number): RequestableGiftSlug[] {
  const s = Math.max(0, Math.min(4, Math.trunc(stage)));
  const pool: RequestableGiftSlug[] = [...LOW];
  if (s >= 2) pool.push(...MID);
  if (s >= 3) pool.push(...HIGH);
  if (s >= 4) pool.push(...PREMIUM);
  return pool;
}

/**
 * Pick one requestable gift for the given stage.
 * @param pick optional deterministic index picker (tests); defaults to random.
 */
export function pickRequestableGift(
  stage: number,
  pick: (len: number) => number = (len) => Math.floor(Math.random() * len),
): RequestableGiftSlug {
  const pool = giftPoolForStage(stage);
  const raw = pick(pool.length);
  const idx = Number.isFinite(raw) ? ((raw % pool.length) + pool.length) % pool.length : 0;
  return pool[idx];
}
