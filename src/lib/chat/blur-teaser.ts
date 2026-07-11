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
