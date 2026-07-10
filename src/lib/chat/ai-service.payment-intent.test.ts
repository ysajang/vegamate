import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('./anthropic-client', () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
  withRetry: (fn: () => unknown) => fn(),
}));

vi.mock('./safety', () => ({
  detectCrisis: () => ({ isCrisis: false, severity: 'none' }),
  SAFETY_SYSTEM_PROMPT: '[SAFETY]',
}));

import { generateAIResponse } from './ai-service';
import type { DbCharacter, DbMessage } from '@/types';

function capturedSystemText(): string {
  const call = createMock.mock.calls.at(-1)?.[0] as
    | { system: Array<{ text: string }> }
    | undefined;
  return call ? call.system.map((b) => b.text).join('\n') : '';
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
});

// P0-c(a) — prod 2026-07-09 (user 6136cd12): Miku dangled "Gotta earn it",
// the user asked "Tell me how" (explicit willingness to pay), and Miku replied
// "I'm not some prize you unlock" — denying the exact path she opened. The
// user still tried to buy milk tea 2 minutes later, on his own, and churned.
describe('payment-intent signal routing (P0-c(a))', () => {
  it('system prompt routes "earn it → how" to a gift answer with marker', async () => {
    await generateAIResponse({
      character: { id: 'c', slug: 'miku', name: 'Miku', persona_prompt: 'p' } as unknown as DbCharacter,
      history: [] as DbMessage[],
      userMessage: 'tell me how',
      selfieAllowed: false,
      availableScenes: [],
      memoryContext: '',
      messageCount: 10,
    });

    const sys = capturedSystemText();
    expect(sys).toMatch(/PAYMENT-INTENT SIGNAL/);
    expect(sys).toMatch(/that is a buying signal/i);
    expect(sys).toMatch(/END with a \[GIFT:type\] marker/i);
    // the exact prod denial lines are named as forbidden
    expect(sys).toContain("I'm not some prize you unlock");
    expect(sys).toContain("that's not how this works");
    // tone guardrails preserved; no NSFW-unlock selling (processor risk)
    expect(sys).toMatch(/never guilt/i);
    expect(sys).toMatch(/NEVER frame a gift as unlocking explicit/i);
  });
});
