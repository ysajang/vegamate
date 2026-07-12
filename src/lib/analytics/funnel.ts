/**
 * Activation funnel instrumentation (Notion §34).
 *
 * Four events only — do not add more without a measurement plan:
 *   signup_complete    → onboarding finished (one-shot, DB-enforced)
 *   chat_enter         → chat room mounted
 *   first_message_sent → first user message accepted (one-shot, DB-enforced)
 *   gift_sheet_open    → gift sheet opened
 *
 * Design:
 * - Fire-and-forget: tracking must NEVER break product flow. All errors
 *   (network, RLS, unique violations on one-shot events) are swallowed.
 * - UTM attribution is first-touch: captured once from the landing URL into
 *   localStorage and attached to every event's metadata.
 * - Inserts go straight to Supabase with the user's session; RLS restricts
 *   inserts to auth.uid() = user_id and reads to the service role.
 */

import { createClient } from '@/lib/supabase/client';

export type FunnelEventName =
  | 'signup_complete'
  | 'chat_enter'
  | 'first_message_sent'
  | 'gift_sheet_open';

export const UTM_STORAGE_KEY = 'vm_utm';

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Extract utm_* params from a query string. Returns null when none present. */
export function parseUtmParams(search: string): UtmParams | null {
  const params = new URLSearchParams(search);
  const utm: UtmParams = {};
  let found = false;
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value && value.trim()) {
      utm[key] = value.trim().slice(0, 200);
      found = true;
    }
  }
  return found ? utm : null;
}

/** Minimal storage surface so tests can inject a fake (vitest runs in node). */
export interface UtmStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): UtmStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Storage can throw in private mode / blocked contexts.
    return null;
  }
}

/**
 * Capture UTM params from the current URL into storage. First-touch: an
 * already-stored attribution is never overwritten (one landing → one signup
 * flow; the original ad keeps credit).
 */
export function captureUtmFromSearch(
  search: string,
  storage: UtmStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    if (storage.getItem(UTM_STORAGE_KEY)) return; // first-touch wins
    const utm = parseUtmParams(search);
    if (!utm) return;
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Never throw from tracking code.
  }
}

/** Read stored UTM attribution. Returns null when absent or unparsable. */
export function getStoredUtm(
  storage: UtmStorage | null = defaultStorage(),
): UtmParams | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as UtmParams;
  } catch {
    return null;
  }
}

/** Minimal client surface used by trackFunnelEvent (injectable for tests). */
export interface FunnelClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } }>;
  };
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

/**
 * Record a funnel event for the current user. Fire-and-forget: resolves
 * without throwing on any failure (no session, network error, RLS rejection,
 * unique violation on one-shot events).
 */
export async function trackFunnelEvent(
  eventName: FunnelEventName,
  metadata?: Record<string, unknown>,
  client?: FunnelClient,
  storage: UtmStorage | null = defaultStorage(),
): Promise<void> {
  try {
    const supabase = client ?? (createClient() as unknown as FunnelClient);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const utm = getStoredUtm(storage);
    const payload: Record<string, unknown> = { ...(metadata ?? {}) };
    if (utm) payload.utm = utm;

    await supabase.from('funnel_events').insert({
      user_id: user.id,
      event_name: eventName,
      metadata: Object.keys(payload).length > 0 ? payload : null,
    });
  } catch {
    // Tracking must never break the product flow.
  }
}
