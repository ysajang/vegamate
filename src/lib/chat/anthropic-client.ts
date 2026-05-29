import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

/**
 * Singleton Anthropic client.
 * Lazily initialized on first use; reused across all LLM call sites.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY environment variable');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Retry wrapper for Anthropic API calls.
 *
 * Retries on 429 (rate limit) and 5xx (server error) with exponential backoff.
 * Non-retryable errors (400, 401, 403, etc.) throw immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Only retry on transient errors
      const isRetryable =
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.InternalServerError ||
        (error instanceof Anthropic.APIConnectionError);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(
        `[Anthropic] Retrying (${attempt + 1}/${maxRetries}) after ${Math.round(delay)}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
