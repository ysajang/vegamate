import { sanitizeString, isOneOf } from '@/lib/validators';

/**
 * In-app feedback validation (shared by the API route).
 * Mirrors the DB check constraints in the feedback migration — keep in sync.
 */

export const FEEDBACK_CATEGORIES = ['general', 'payment', 'bug', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_MAX_LEN = 5000;

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  /** Optional client context (path, app version, ...). Flat JSON only. */
  context: Record<string, unknown> | null;
}

export type FeedbackValidation =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

export function validateFeedbackInput(body: unknown): FeedbackValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = body as Record<string, unknown>;

  if (!isOneOf(b.category, FEEDBACK_CATEGORIES)) {
    return { ok: false, error: 'Invalid category' };
  }

  const message = sanitizeString(b.message);
  if (message.length === 0) {
    return { ok: false, error: 'Message is required' };
  }
  if (message.length > FEEDBACK_MAX_LEN) {
    return { ok: false, error: `Message too long (max ${FEEDBACK_MAX_LEN} characters)` };
  }

  const context =
    b.context && typeof b.context === 'object' && !Array.isArray(b.context)
      ? (b.context as Record<string, unknown>)
      : null;

  return { ok: true, value: { category: b.category, message, context } };
}
