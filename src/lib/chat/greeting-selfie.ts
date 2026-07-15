/**
 * Greeting selfie (Notion §34, round 3): a new signup's very first chat
 * screen must prove the product's core value (selfie + conversation) with
 * zero clicks — the character's greeting arrives with one free-tier selfie
 * attached.
 *
 * This deliberately CONSUMES the selfie-economy lifetime freebie (the one
 * unblurred first selfie): the wow moment moves to the first screen, and
 * every later selfie in chat arrives as a blurred monetization card. The
 * two systems share one rule — collection count 0 means first selfie ever.
 *
 * Guards that apply to chat selfies (session cap, frequency) do NOT apply
 * here by design; the only gate is "first selfie ever", which also prevents
 * a second conversation's greeting from granting another freebie.
 */

export interface GreetingSelfieCandidate {
  id: string;
  rarity: string;
}

export interface GreetingSelfiePlan {
  selfieId: string;
  rarity: string;
  contentType: 'text_with_selfie';
  collectionUpsert: {
    user_id: string;
    selfie_id: string;
    character_id: string;
    rarity: string;
  };
}

export function planGreetingSelfie(input: {
  /** Only a brand-new conversation greets; reactivations must not. */
  isNewConversation: boolean;
  /** User's lifetime selfie collection size — freebie only at exactly 0. */
  selfieCollectionCount: number;
  /** Free-tier pick from the pool; null when the pool yielded nothing. */
  selfie: GreetingSelfieCandidate | null;
  userId: string;
  characterId: string;
}): GreetingSelfiePlan | null {
  if (!input.isNewConversation) return null;
  if (input.selfieCollectionCount !== 0) return null;
  if (!input.selfie) return null;

  return {
    selfieId: input.selfie.id,
    rarity: input.selfie.rarity,
    contentType: 'text_with_selfie',
    collectionUpsert: {
      user_id: input.userId,
      selfie_id: input.selfie.id,
      character_id: input.characterId,
      rarity: input.selfie.rarity,
    },
  };
}
