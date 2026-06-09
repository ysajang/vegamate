import { ENGAGEMENT_CONFIG } from '@/config/constants';

/**
 * Selfie frequency GUARD (not a trigger anymore).
 *
 * The decision to send a selfie now belongs to the AI: while composing its
 * reply it judges whether a photo is a natural part of the moment and emits a
 * [SELFIE:scene] marker. This module no longer matches user keywords to force a
 * photo — that was mechanical and broke immersion.
 *
 * What remains here is purely protective: decide whether the AI is even ALLOWED
 * to offer a selfie this turn, so we don't spam photos (immersion + image-pool
 * value + cost). If allowed, we tell the AI it *may* send one when it fits; if
 * not, we instruct it to skip photos this turn entirely.
 */

export interface SelfieGuardContext {
  /** Lifetime message count for the conversation. */
  messageCount: number;
  /** How many messages ago the last selfie was sent (null = none yet). */
  lastSelfieMessageIndex: number | null;
}

export interface SelfieGuardResult {
  /** Whether the AI is permitted to send a selfie this turn (its choice if true). */
  allowed: boolean;
}

/** Minimum turns between selfies (anti-spam). */
const MIN_TURNS_BETWEEN_SELFIES = 5;

export function evaluateSelfieGuard(ctx: SelfieGuardContext): SelfieGuardResult {
  const { messageCount, lastSelfieMessageIndex } = ctx;

  // Too early in the relationship for photos.
  if (messageCount < ENGAGEMENT_CONFIG.MIN_MESSAGES_BEFORE_SELFIE) {
    return { allowed: false };
  }

  // Anti-spam: enforce spacing since the last selfie.
  if (lastSelfieMessageIndex !== null && lastSelfieMessageIndex < MIN_TURNS_BETWEEN_SELFIES) {
    return { allowed: false };
  }

  return { allowed: true };
}
