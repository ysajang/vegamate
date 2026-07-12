import { SELFIE_TIERS, type SelfieTier } from './selfie-tier';

/**
 * Blur-teaser unlock (round 1.5 addendum).
 *
 * When a user asks for explicit photos, the in-character refusal (safety rule
 * 5) can be paired with ONE blurred premium card: partial gaussian blur,
 * outfit/mood recognizable, original never reaches the client (server-side
 * pre-generated blur + originals in a private bucket behind the entitlement
 * API). CTA opens the gift sheet ($4.99+ filter); webhook confirmation
 * unblurs THAT card into the collection. Max one teaser per user per day.
 *
 * Copy is relationship-framed ONLY ("private photo" / "너한테만") — no
 * sexualized sales language, audited by string test (payment-processor
 * defense; PayPal is the only rail).
 */

/** Words that must never appear in teaser-facing copy. */
export const BANNED_SALES_WORDS = [
  'sexy',
  'hot',
  'uncensored',
  'nude',
  'nsfw',
  'lewd',
  'xxx',
  '18+',
  'explicit',
  '야한',
  '섹시',
  '노출',
] as const;

/** User-facing teaser copy (card caption + CTA). Relationship frame only. */
export const TEASER_COPY = {
  en: {
    caption: 'a private photo I keep for someone special…',
    cta: 'Send a gift to see it',
  },
  ko: {
    caption: '너한테만 보여줄까 말까 하는 사진인데…',
    cta: '선물 보내고 보기',
  },
} as const;

/**
 * Did the user ask for explicit/suggestive photos this turn?
 * Deliberately conservative: plain selfie requests must NOT fire (they get a
 * normal selfie). Explicit adjectives/nouns near a photo/see verb do.
 */
const EXPLICIT_TERMS =
  /(nudes?|naked|topless|lingerie|underwear|bikini|swimsuit|shirtless|undress|strip|sexy|hot pic|nsfw|lewd|야한|섹시한?|벗은|속옷|비키니|수영복|노출|은꼴)/i;
const PHOTO_CONTEXT =
  /(photo|pic(ture)?s?|selfie|image|see you|show me|send|사진|셀카|보여|보내)/i;

export function detectExplicitPhotoRequest(text: string): boolean {
  if (!text) return false;
  return EXPLICIT_TERMS.test(text) && PHOTO_CONTEXT.test(text);
}

/** Frequency guard: one blurred teaser per user per 24h. */
export function teaserQuotaAvailable(
  lastTeaserAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastTeaserAt) return true;
  const last = typeof lastTeaserAt === 'string' ? new Date(lastTeaserAt) : lastTeaserAt;
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= 24 * 60 * 60 * 1000;
}

/**
 * Which tier to tease: the LOWEST tier the user cannot access. Teasing the
 * cheapest locked tier keeps the price ladder intact — a $4.99 gift unblurs
 * the teased card (doc), so teasing premium_s to a free user would sell the
 * top tier for $4.99 and destroy dinner/ring economics.
 */
export function pickTeaserTier(allowedTiers: readonly string[]): SelfieTier | null {
  for (const tier of SELFIE_TIERS) {
    if (tier === 'free') continue;
    if (!allowedTiers.includes(tier)) return tier;
  }
  return null;
}

/** A blur-teaser card previously attached to a chat message. */
export interface TeaserCandidate {
  selfieId: string;
  createdAt: string | Date;
}

/**
 * Unbound-purchase rescue (round 2): a qualifying ($4.99+) gift purchase that
 * arrived WITHOUT an explicit unblur binding (bought from the exhaustion
 * sheet, the locked-input sheet, or an older inline card — anywhere but the
 * teaser CTA) auto-binds to the user's pending teaser: the most recent teaser
 * card within the 24h quota window whose selfie is not yet in the collection.
 * Closes every paid-but-still-blurred path; the daily quota guarantees at
 * most one pending candidate per window, so the pick is deterministic.
 */
export function resolveAutoUnblurCandidate(
  candidates: readonly TeaserCandidate[],
  collectedSelfieIds: ReadonlySet<string>,
  now: Date = new Date()
): string | null {
  const windowMs = 24 * 60 * 60 * 1000;
  let best: { selfieId: string; t: number } | null = null;
  for (const c of candidates) {
    if (!c.selfieId || collectedSelfieIds.has(c.selfieId)) continue;
    const t = new Date(c.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (now.getTime() - t > windowMs || t > now.getTime()) continue;
    if (!best || t > best.t) best = { selfieId: c.selfieId, t };
  }
  return best?.selfieId ?? null;
}
