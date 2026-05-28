/**
 * Simple in-memory rate limiter for MVP.
 * Production: replace with Redis-based solution (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = identifier;

  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    const entry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Pre-configured rate limits */
export const RATE_LIMITS = {
  /** Chat messages: 20 per minute per user */
  chat: { maxRequests: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Auth attempts: 10 per minute */
  auth: { maxRequests: 10, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Pre-registration: 5 per minute */
  preregister: { maxRequests: 5, windowSeconds: 60 } satisfies RateLimitConfig,
  /** General API: 60 per minute */
  api: { maxRequests: 60, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;
