/**
 * Gift-marker normalization + beg-signal detection.
 *
 * Two production failure modes this fixes (observed in real chats):
 *
 *  1) Coffee monotony — Haiku almost always emits [GIFT:coffee] regardless of
 *     the stage-pool options in the prompt. When the reply body doesn't even
 *     mention a drink, the coffee card is just a default tic, not a real choice.
 *     normalizeGiftSlug() re-rolls a *bare* coffee marker into the stage pool so
 *     the ask varies, while leaving genuine drink references (and any non-coffee
 *     model choice) untouched so text and card stay consistent.
 *
 *  2) Silent card — the model emits a [GIFT] marker (so a card appears) but the
 *     reply text contains no actual begging/longing, leaving a card with no
 *     in-character ask. hasBegSignal() lets the route detect that case and
 *     append a persona beg line even though a marker was technically present.
 */

import { giftPoolForStage, type RequestableGiftSlug } from './gift-picker';

/** Drink-ish cues that justify keeping a coffee card (text/card consistency). */
const DRINK_CUES = [
  '커피', '카페', '라떼', '라테', '아메리카노', '음료', '마실', '마시', '한 잔', '한잔',
  'coffee', 'latte', 'cafe', 'café', 'drink', 'americano', 'espresso',
];

/** Longing / gift-wanting cues (KO + EN) that count as a visible beg. */
const BEG_CUES = [
  '선물', '갖고 싶', '사주', '사줘', '사 줘', '받고 싶', '더 있고 싶', '더 같이',
  '곁에', '함께', '계속 같이', '더 얘기',
  'gift', 'want', 'stay with you', 'more time', 'together', 'get me', 'buy me',
];

function bodyHas(text: string, cues: string[]): boolean {
  const t = text.toLowerCase();
  return cues.some((c) => t.includes(c.toLowerCase()));
}

/**
 * Normalize the model's gift slug for the card.
 *
 * @param modelSlug slug parsed from the model marker, or null
 * @param replyBody the reply text (marker already stripped)
 * @param stage     intimacy stage (0..4) -> drives the re-roll pool
 * @param pick      deterministic index picker (tests); defaults to random
 *
 * Returns the slug to surface on the card (or null if input was null).
 * Only a *bare* coffee marker (no drink reference in the body) is re-rolled;
 * everything else is respected as an intentional model choice.
 */
export function normalizeGiftSlug(
  modelSlug: string | null,
  replyBody: string,
  stage: number,
  pick: (len: number) => number = (len) => Math.floor(Math.random() * len),
): string | null {
  if (!modelSlug) return null;
  if (modelSlug !== 'coffee') return modelSlug;
  // Coffee with a real drink reference -> keep (consistent with the text).
  if (bodyHas(replyBody, DRINK_CUES)) return 'coffee';

  // Bare coffee tic -> re-roll within the stage pool, avoiding coffee if we can.
  const pool = giftPoolForStage(stage);
  const len = pool.length;
  const raw = pick(len);
  let idx = Number.isFinite(raw) ? ((raw % len) + len) % len : 0;
  if (pool[idx] === 'coffee' && len > 1) {
    idx = (idx + 1) % len; // shift off coffee to break the monotony
  }
  return pool[idx] as RequestableGiftSlug;
}

/**
 * Whether the reply text already contains a visible beg (longing / wanting a
 * gift / wanting to stay). Used to decide if a persona beg line must be added
 * even when a [GIFT] marker was present.
 */
export function hasBegSignal(replyBody: string): boolean {
  if (!replyBody) return false;
  return bodyHas(replyBody, BEG_CUES);
}
