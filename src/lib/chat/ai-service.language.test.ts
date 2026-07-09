import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the system prompt the service builds, and control the model reply.
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
    // Persona bodies are Korean-heavy with ㅋㅋ style examples — the leak source.
    persona_prompt: '너는 미쿠야. 말투 예시: "에이 거짓말~ ㅋㅋ", "ㄹㅇ?"',
  } as unknown as DbCharacter;
}

function modelReply(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

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
  createMock.mockResolvedValue(modelReply('ok'));
});

describe('language directive in the system prompt (P0 Korean-leak fix)', () => {
  it('en scenario: system prompt carries an explicit English-only rule with a Korean-slang ban', async () => {
    await generateAIResponse({
      ...baseParams,
      userMessage: 'Hii',
      responseLanguage: 'en',
    });

    const sys = capturedSystemText();
    expect(sys).toContain('Respond ONLY in English');
    expect(sys).toMatch(/ㅋㅋ/); // the ban names the exact leaking slang
    expect(sys).toMatch(/Never mix Korean/i);
    // The directive must sit ABOVE the persona so it wins the priority fight.
    expect(sys.indexOf('Respond ONLY in English')).toBeLessThan(
      sys.indexOf('너는 미쿠야')
    );
  });

  it('ko scenario: Korean replies stay the normal, expected behavior', async () => {
    await generateAIResponse({
      ...baseParams,
      userMessage: '안녕 뭐해?',
      responseLanguage: 'ko',
    });

    const sys = capturedSystemText();
    expect(sys).toContain('Respond ONLY in Korean');
    expect(sys).not.toMatch(/Never mix Korean/i);
  });

  it('no resolved language: falls back to detect-latest-message directive (legacy callers unchanged)', async () => {
    await generateAIResponse({
      ...baseParams,
      userMessage: 'hey',
    });

    expect(capturedSystemText()).toMatch(/LATEST message/i);
  });
});
