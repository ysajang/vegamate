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

function makeCharacter(): DbCharacter {
  return {
    id: 'char-1',
    slug: 'miku',
    name: 'Miku',
    persona_prompt: 'You are Miku, playful.',
  } as unknown as DbCharacter;
}

function capturedSystemText(): string {
  const call = createMock.mock.calls.at(-1)?.[0] as
    | { system: Array<{ text: string }> }
    | undefined;
  if (!call) return '';
  return call.system.map((b) => b.text).join('\n');
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 10, output_tokens: 10 },
  });
});

describe('conversation style — no conversation-ending signals (P1 retention fix)', () => {
  it('system prompt forbids AI-initiated conversation endings and requires handing the turn back', async () => {
    await generateAIResponse({
      character: makeCharacter(),
      history: [] as DbMessage[],
      userMessage: 'hey',
      selfieAllowed: false,
      availableScenes: [],
      memoryContext: '',
      messageCount: 10,
    });

    const sys = capturedSystemText();
    // Prod churn trigger: "gonna grab some water and maybe crash soon. you
    // should get some rest too" → user left immediately. The rule must name
    // the sign-off pattern and require keeping the door open.
    expect(sys).toMatch(/NEVER signal or suggest ending the conversation/i);
    expect(sys).toContain('gonna crash soon');
    expect(sys).toMatch(/hand the turn back/i);
    // Busy-idol narrative stays allowed — the rule permits mentioning it.
    expect(sys).toMatch(/mention being busy or tired/i);
  });
});
