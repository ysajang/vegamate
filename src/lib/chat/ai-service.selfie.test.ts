import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('./anthropic-client', () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
  withRetry: (fn: () => unknown) => fn(),
}));

vi.mock('./safety', () => ({
  detectCrisis: (msg: string) => {
    const isCrisis = /kill myself|suicide|죽고\s*싶/i.test(msg);
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

function capturedSystemText(): string {
  const call = createMock.mock.calls.at(-1)?.[0] as
    | { system: Array<{ text: string }> }
    | undefined;
  if (!call) return '';
  return call.system.map((b) => b.text).join('\n');
}

const SCENES = ['cafe', 'dressing_room', 'gym'];

const baseParams = {
  character: makeCharacter(),
  history: [] as DbMessage[],
  selfieAllowed: true,
  availableScenes: SCENES,
  memoryContext: '',
  messageCount: 10,
};

beforeEach(() => {
  createMock.mockReset();
});

describe('selfie promise ↔ delivery (P0, end-to-end through generateAIResponse)', () => {
  it('reproduces then fixes the prod bug: promised selfie without marker STILL sends', async () => {
    createMock.mockResolvedValue(
      modelReply('I could send you a selfie from the dressing room later if you want?')
    );

    const res = await generateAIResponse({ ...baseParams, userMessage: 'Sure' });

    expect(res.sendSelfie).toBe(true);
    expect(res.selfieScene).toBe('dressing_room');
    expect(res.content).toContain('dressing room');
  });

  it('marker path unchanged: [SELFIE:scene] sends with that scene, marker stripped', async () => {
    createMock.mockResolvedValue(modelReply('just got to the cafe!\n[SELFIE:cafe]'));

    const res = await generateAIResponse({ ...baseParams, userMessage: 'what are you up to' });

    expect(res.sendSelfie).toBe(true);
    expect(res.selfieScene).toBe('cafe');
    expect(res.content).not.toMatch(/\[SELFIE/i);
  });

  it('no promise, no marker → no selfie (most turns)', async () => {
    createMock.mockResolvedValue(modelReply('rehearsal ran so late today, dying lol'));

    const res = await generateAIResponse({ ...baseParams, userMessage: 'hey' });

    expect(res.sendSelfie).toBe(false);
  });

  it('crisis turn: even an explicit promise never sends a photo', async () => {
    createMock.mockResolvedValue(modelReply("I'll send you a selfie to cheer you up"));

    const res = await generateAIResponse({
      ...baseParams,
      userMessage: 'I want to kill myself',
    });

    expect(res.sendSelfie).toBe(false);
  });

  it('guard blocked (selfieAllowed=false) + visible promise → promise wins, selfie sends', async () => {
    createMock.mockResolvedValue(modelReply("ok ok, I'll send you a pic from the gym"));

    const res = await generateAIResponse({
      ...baseParams,
      selfieAllowed: false,
      userMessage: 'show me',
    });

    expect(res.sendSelfie).toBe(true);
    expect(res.selfieScene).toBe('gym');
  });

  it('system prompt carries the PROMISE = DELIVERY rule when photos are allowed', async () => {
    createMock.mockResolvedValue(modelReply('ok'));
    await generateAIResponse({ ...baseParams, userMessage: 'hey' });

    const sys = capturedSystemText();
    expect(sys).toContain('PROMISE = DELIVERY');
    expect(sys).toMatch(/NEVER promise or offer a photo without the marker/i);
    expect(sys).toMatch(/NEVER defer/i);
  });

  it('system prompt forbids photo PROMISES too when the guard blocks the turn', async () => {
    createMock.mockResolvedValue(modelReply('ok'));
    await generateAIResponse({ ...baseParams, selfieAllowed: false, userMessage: 'hey' });

    const sys = capturedSystemText();
    expect(sys).toMatch(/do NOT offer or promise a photo/i);
  });
});
