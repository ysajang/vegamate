/**
 * Input-gating logic for the out-of-hearts state.
 *
 * Bug context: at zero balance the character begs and a gift sheet opens. The
 * sheet's purchase is async (redirects to PayPal; hearts are credited later via
 * webhook), so there is no in-session "purchase succeeded" signal. Previously
 * closing the sheet unconditionally cleared the gate, which re-enabled the
 * composer with the balance still at zero — so the user could chat forever and
 * re-trigger the beg + sheet every turn (the "선물 창이 계속 뜨는" loop).
 *
 * Rule: the composer is gated whenever a non-subscriber has no hearts. Closing
 * the sheet does NOT clear the gate; only an actual refill (balance > 0, picked
 * up on the next /api/hearts read after the webhook credits the gift) does.
 */

export interface GateInput {
  /** Current heart balance, or null while still loading. */
  balance: number | null;
  isSubscriber: boolean;
}

/** True when the message composer should be locked. */
export function shouldGateInput({ balance, isSubscriber }: GateInput): boolean {
  if (isSubscriber) return false;
  // null = not loaded yet; don't lock pre-emptively (avoids a flash-lock that
  // would block a user who actually has hearts).
  if (balance === null) return false;
  return balance <= 0;
}

/**
 * When the gift sheet is closed, decide whether to lift the gate. Only lift it
 * if hearts were actually refilled (balance > 0). A plain close with a still-
 * empty balance keeps the gate, so the user can re-read the chat but cannot
 * send another free message.
 */
export function shouldClearGateOnClose({ balance }: { balance: number | null }): boolean {
  return typeof balance === 'number' && balance > 0;
}
