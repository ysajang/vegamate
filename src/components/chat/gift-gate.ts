/**
 * Frequency guard for the zero-balance gift gate.
 *
 * At zero hearts the composer stays tappable but "locked": tapping it reopens
 * the gift sheet to drive the purchase. To avoid the close-tap instantly
 * reopening the sheet (a flicker, since the close button and the composer can
 * be hit in quick succession), we apply a short cooldown after each close. A
 * deliberate tap after the cooldown still reopens the sheet.
 */

export interface ReopenInput {
  /** Current timestamp (ms). */
  now: number;
  /** Timestamp of the last sheet close (ms), or null if never closed. */
  lastClosedAt: number | null;
  /** Anti-flicker window after a close during which a tap is ignored. */
  cooldownMs: number;
}

export function shouldReopenGiftSheet({ now, lastClosedAt, cooldownMs }: ReopenInput): boolean {
  if (lastClosedAt === null) return true;
  return now - lastClosedAt >= cooldownMs;
}

/** Default anti-flicker cooldown (ms). */
export const GIFT_SHEET_REOPEN_COOLDOWN_MS = 400;
