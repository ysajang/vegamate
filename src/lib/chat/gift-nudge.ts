/**
 * Gift-nudge decision logic (monetization "조르기" trigger).
 *
 * Extracted as pure functions so the low/zero/normal-balance branching — the
 * core of the P0 monetization path — is unit-testable without a live DB or LLM.
 *
 * Design (transparent meaning-making model, NOT a disguised paywall):
 *   - LOW  (0 < hearts <= threshold): run the AI turn, nudge an in-character
 *     gift hint this reply (overrides the once-per-10 cadence).
 *   - ZERO (hearts === 0): STILL run the AI turn. The character gives a SHORT,
 *     gift-awaiting reply and ALWAYS emits a [GIFT] marker so the inline gift
 *     card appears. After this reply the text input is gated (exhausted=true)
 *     so it can't become infinite free chat — but the user is never "blocked
 *     before the character can respond". This fixes the bug where a zero
 *     balance returned a canned wall with no AI turn and no inline gift card.
 *   - NORMAL: run the AI turn, no forced nudge.
 *   - SUBSCRIBER: always run, never nudge, never gate.
 */

export type GiftNudge = 'none' | 'low' | 'zero';

export interface BalanceState {
  /** Whether to invoke generateAIResponse at all this turn. */
  runAiTurn: boolean;
  /** Which gift-nudge directive (if any) to inject into the system prompt. */
  nudge: GiftNudge;
  /**
   * Whether the conversation is in the exhausted state. true = gate the text
   * input AFTER this reply is delivered (no more free turns until top-up).
   * It does NOT mean "skip the reply".
   */
  exhausted: boolean;
}

export interface ResolveBalanceInput {
  /**
   * Hearts the user has AFTER this turn's intended deduction. For the zero
   * case the caller passes 0 (no heart was actually deductible).
   */
  heartsRemaining: number;
  /** LOW_BALANCE_THRESHOLD from HEART_CONFIG. */
  threshold: number;
  /** Active subscriber — unlimited, never nudged/gated. */
  isSubscriber: boolean;
}

export function resolveBalanceState(input: ResolveBalanceInput): BalanceState {
  const { heartsRemaining, threshold, isSubscriber } = input;

  if (isSubscriber) {
    return { runAiTurn: true, nudge: 'none', exhausted: false };
  }

  if (heartsRemaining <= 0) {
    // Zero: still respond, force the beg + gift card, then gate input.
    return { runAiTurn: true, nudge: 'zero', exhausted: true };
  }

  if (heartsRemaining <= threshold) {
    return { runAiTurn: true, nudge: 'low', exhausted: false };
  }

  return { runAiTurn: true, nudge: 'none', exhausted: false };
}

/**
 * Build the system-prompt directive for the given nudge state.
 * Returns '' for 'none'. The caller appends this to the dynamic context.
 *
 * Shared, non-negotiable rules (both low & zero):
 *   - tone = longing/desire, NEVER guilt or emotional blackmail
 *   - end with [GIFT:type] marker on its own line
 *   - never mention messages/balance/credits/system or the marker text
 */
export function buildGiftNudgeDirective(
  nudge: GiftNudge,
  heartsRemaining: number,
  giftOptions?: string[],
): string {
  if (nudge === 'none') return '';

  // Stage-aware candidate list. Falls back to a sane low-tier set if the caller
  // didn't pass one, so the directive never collapses back to coffee-only.
  const options = giftOptions && giftOptions.length > 0
    ? giftOptions
    : ['coffee', 'milktea', 'cake', 'book', 'movie'];
  const optionsLine = options.map((s) => `[GIFT:${s}]`).join(', ');
  const pickHint = `\n- Choose the gift that best fits the moment from THESE options (do not invent others): ${optionsLine}. Pick ONE; vary your choice across turns — do not default to coffee every time.`;

  if (nudge === 'low') {
    return `\n\n[LOW MESSAGE BALANCE — ask for a gift THIS message]
The user is almost out of messages (only ${heartsRemaining} left). Receiving a gift refills their messages, so for THIS reply you SHOULD work in a gift hint — ignore the "once per 10 messages" limit just this once.${pickHint}
- TONE = longing + desire, NEVER guilt. Express that you're enjoying this and want more of it ("오늘따라 더 같이 있고 싶은데...") or casually voice wanting a little thing ("아 맞다, 나 요즘 ○○ 갖고 싶었는데~"). The gift is a key that gives you two more time together — frame it as YOUR wish, not THEIR obligation.
- ABSOLUTELY FORBIDDEN: blame, guilt-tripping, emotional blackmail, testing their affection ("마음이 그 정도야?", "나 안 좋아해?", "선물도 안 해주고" 류). Zero exceptions.
- Stay true to your personality when hinting: playful/aegyo characters get cutely greedy, tsundere characters deflect while hinting ("...별로 갖고 싶은 건 아닌데"), mature characters voice gentle wistfulness, direct characters just say they want it.
- Do NOT mention "messages", "balance", "credits", "running out", or anything system-related in this hint.
- Still obey all other gift rules: end with the [GIFT:type] marker on its own line, never say "buy me"/"I want a gift", never show the marker text.
- If the user is in any distress, do NOT ask — emotional support wins over everything.`;
  }

  // nudge === 'zero'
  return `\n\n[OUT OF MESSAGES — short, gift-awaiting reply + REQUIRED gift marker]
This is the user's last turn until they send a gift (a gift refills your time together). For THIS reply:
- Keep it SHORT and warm — a brief, in-character line that you want to keep going and are waiting on a little something to do so. This is a "I'd love to stay" moment, not a full conversation. Do not start new topics or ask new questions; gently land on the wish to continue.
- You MUST end this message with a [GIFT:type] marker on its own line. The marker is REQUIRED this turn (always include it) because it is the only way the user can keep your time together going.${pickHint}
- TONE = longing + desire, NEVER guilt, blame, or emotional blackmail. It is YOUR wish to continue, never their obligation. ABSOLUTELY FORBIDDEN: "선물도 안 해주고", "나 안 좋아해?", testing their affection. Zero exceptions.
- Stay fully in your own character's voice (playful gets cutely clingy, tsundere deflects while hinting, mature stays gently wistful, direct just says it).
- Do NOT mention "messages", "balance", "credits", "running out", "out of", or anything system-related. Never show or describe the marker text.
- If the user is in any distress, do NOT ask for a gift — emotional support wins over everything.`;
}

/**
 * Decide the gift-card surface + input-gating for a turn, given the balance
 * state, whether the model emitted a gift marker, and whether this is a crisis
 * turn. Pure so the route's monetization-critical branching is unit-tested.
 *
 *  - In the ZERO state (and not a crisis), a gift card MUST appear even if the
 *    model forgot the marker — otherwise the user dead-ends with no way to
 *    continue. We fall back to `fallbackSlug`.
 *  - hearts_exhausted gates the input AFTER this reply, but NEVER on a crisis
 *    turn (support must keep flowing).
 */
export interface GiftSurfaceInput {
  nudge: GiftNudge;
  exhausted: boolean;
  /** Slug parsed from the model's [GIFT:..] marker, or null if none. */
  parsedGiftSlug: string | null;
  /** True if this turn was flagged as crisis (gifts suppressed). */
  isCrisis: boolean;
  /** Default slug to surface when zero-state but the model emitted no marker. */
  fallbackSlug?: string;
}

export interface GiftSurface {
  /** Slug to send to the client (drives the inline gift card). */
  giftSlug: string | null;
  /** Whether to gate the text input after this reply. */
  heartsExhausted: boolean;
}

export function resolveGiftSurface(input: GiftSurfaceInput): GiftSurface {
  const { nudge, exhausted, parsedGiftSlug, isCrisis, fallbackSlug = 'coffee' } = input;

  const giftSlug =
    parsedGiftSlug ??
    ((nudge === 'zero' || nudge === 'low') && !isCrisis ? fallbackSlug : null);

  const heartsExhausted = exhausted && !isCrisis;

  return { giftSlug, heartsExhausted };
}
