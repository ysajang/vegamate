import { INTIMACY_CONFIG } from '@/config/constants';

/**
 * Compute intimacy points for a single user turn.
 *
 * Deliberately weighted so raw message count alone climbs slowly — the
 * relationship has to feel earned before any upgrade moment lands. Meaningful
 * signals (substantive messages, re-engagement after a gap) add a little more;
 * gifts (handled separately) add the most.
 */
export function computeTurnIntimacyPoints(params: {
  userMessage: string;
  isComeback: boolean;
}): number {
  const { userMessage, isComeback } = params;
  let points = INTIMACY_CONFIG.POINTS_PER_TURN;

  if (userMessage.trim().length >= INTIMACY_CONFIG.LONG_MESSAGE_CHARS) {
    points += INTIMACY_CONFIG.POINTS_LONG_MESSAGE_BONUS;
  }
  if (isComeback) {
    points += INTIMACY_CONFIG.POINTS_COMEBACK_BONUS;
  }
  return points;
}

/** Points a gift contributes to intimacy, from its hearts_value. */
export function computeGiftIntimacyPoints(heartsValue: number): number {
  return Math.floor(Math.max(heartsValue, 0) / INTIMACY_CONFIG.GIFT_DIVISOR);
}

export interface UpgradePromptDecisionInput {
  /** Did intimacy stage just increase on this turn? */
  stagedUp: boolean;
  /** New stage after the bump. */
  stage: number;
  /** Highest stage at which a prompt has already been shown. */
  lastPromptStage: number;
  /** When the last prompt was shown (ISO string) or null. */
  lastPromptAt: string | null;
  /** Whether the user already has an active subscription. */
  hasActiveSubscription: boolean;
  /** Now, for cooldown math (injectable for tests). */
  now?: number;
}

/**
 * Decide whether to surface an in-chat upgrade prompt on THIS turn.
 *
 * Rules (all must hold):
 *  - user is NOT already subscribed
 *  - a stage-up just happened this turn (the "emotional peak")
 *  - the new stage is at/above the minimum monetizable stage (never stage 0/1)
 *  - we haven't already prompted at this stage or higher (no per-stage nagging)
 *  - the post-dismissal cooldown has elapsed
 */
export function shouldShowUpgradePrompt(input: UpgradePromptDecisionInput): boolean {
  const {
    stagedUp,
    stage,
    lastPromptStage,
    lastPromptAt,
    hasActiveSubscription,
    now = Date.now(),
  } = input;

  if (hasActiveSubscription) return false;
  if (!stagedUp) return false;
  if (stage < INTIMACY_CONFIG.UPGRADE_MIN_STAGE) return false;
  if (stage <= lastPromptStage) return false;

  if (lastPromptAt) {
    const elapsed = now - new Date(lastPromptAt).getTime();
    if (elapsed < INTIMACY_CONFIG.UPGRADE_DISMISS_COOLDOWN_MS) return false;
  }

  return true;
}

/**
 * Pick which tier to suggest at a given stage.
 * stage 2 (close) → "deeper" (more talk). stage 3+ (trusted/devoted) → "lover".
 */
export function suggestedTierForStage(stage: number): 'deeper' | 'lover' {
  return stage >= 3 ? 'lover' : 'deeper';
}
