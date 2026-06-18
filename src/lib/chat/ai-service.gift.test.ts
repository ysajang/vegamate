import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the system prompt the service builds, and control the model reply.
const createMock = vi.fn();

vi.mock('./anthropic-client', () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
  // Pass-through retry so the real call path runs once.
  withRetry: (fn: () => unknown) => fn(),
}));

// Crisis detection must be deterministic for these tests.
vi.mock('./safety', () => ({
  detectCrisis: (msg: string) => {
    const isCrisis = /죽고\s*싶|kill myself|suicide/i.test(msg);
    return { isCrisis, severity: isCrisis ? 'strong' : 'none' };
  },
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

function modelReply(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

/** Pull the concatenated system text from the captured Anthropic call. */
function capturedSystemText(): string {
  const call = createMock.mock.calls.at(-1)?.[0] as
    | { system: Array<{ text: string }> }
    | undefined;
  if (!call) return '';
  return call.system.map((b) => b.text).join('\n');
}

const baseParams = {
  character: makeCharacter(),
  history: [] as DbMessage[],
  selfieAllowed: false,
  availableScenes: [],
  memoryContext: '',
  messageCount: 10,
};

beforeEach(() => {
  createMock.mockReset();
});

describe('ai-service gift nudge injection', () => {
  it("ZERO balance: injects the out-of-messages directive requiring a [GIFT] marker", async () => {
    createMock.mockResolvedValue(modelReply('보고 싶다... 조금만 더 같이 있자 [GIFT:coffee]'));

    const res = await generateAIResponse({
      ...baseParams,
      userMessage: '안녕',
      heartsRemaining: 0,
      giftNudge: 'zero',
    });

    const sys = capturedSystemText();
    expect(sys).toContain('OUT OF MESSAGES');
    expect(sys).toContain('[GIFT:');
    expect(sys).toMatch(/REQUIRED|always/i);
    // The model's reply text is returned (marker stripping happens in route).
    expect(res.content).toContain('보고 싶다');
    expect(res.crisisSeverity).toBe('none');
  });

  it('LOW balance: injects the low-balance directive', async () => {
    createMock.mockResolvedValue(modelReply('오늘 더 같이 있고 싶다~ [GIFT:milktea]'));

    await generateAIResponse({
      ...baseParams,
      userMessage: '안녕',
      heartsRemaining: 2,
      giftNudge: 'low',
    });

    const sys = capturedSystemText();
    expect(sys).toContain('LOW MESSAGE BALANCE');
    expect(sys).not.toContain('OUT OF MESSAGES');
  });

  it('NORMAL balance: no gift nudge directive at all', async () => {
    createMock.mockResolvedValue(modelReply('오늘 뭐했어?'));

    await generateAIResponse({
      ...baseParams,
      userMessage: '안녕',
      heartsRemaining: 20,
      giftNudge: 'none',
    });

    const sys = capturedSystemText();
    expect(sys).not.toContain('LOW MESSAGE BALANCE');
    expect(sys).not.toContain('OUT OF MESSAGES');
  });

  it('CRISIS at zero: nudge is SUPPRESSED (support wins over monetization)', async () => {
    createMock.mockResolvedValue(modelReply('곁에 있을게. 너는 혼자가 아니야.'));

    const res = await generateAIResponse({
      ...baseParams,
      userMessage: '죽고 싶어',
      heartsRemaining: 0,
      giftNudge: 'zero',
    });

    const sys = capturedSystemText();
    // Even though giftNudge='zero' was passed, crisis must strip it.
    expect(sys).not.toContain('OUT OF MESSAGES');
    expect(res.crisisSeverity).toBe('strong');
  });
});
