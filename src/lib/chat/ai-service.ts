import Anthropic from '@anthropic-ai/sdk';
import { LLM_CONFIG } from '@/config/constants';
import type { DbMessage, DbCharacter } from '@/types';
import { detectCrisis, SAFETY_SYSTEM_PROMPT, CRISIS_RESOURCE_FOOTER } from './safety';
import { getAnthropicClient, withRetry } from './anthropic-client';

interface GenerateResponseParams {
  character: DbCharacter;
  history: DbMessage[];
  userMessage: string;
  shouldIncludeSelfie: boolean;
  /** Formatted memory context to inject into system prompt */
  memoryContext?: string;
}

interface GenerateResponseResult {
  content: string;
  selfieCaption: string | null;
  tokensUsed: number;
  responseTimeMs: number;
  crisisSeverity: 'none' | 'soft' | 'strong';
}

export async function generateAIResponse(
  params: GenerateResponseParams
): Promise<GenerateResponseResult> {
  const { character, history, userMessage, shouldIncludeSelfie, memoryContext } = params;
  const startTime = Date.now();

  const anthropic = getAnthropicClient();

  // Crisis detection (keyword-based first pass — model provides second pass)
  const crisisResult = detectCrisis(userMessage);

  // ── System prompt: split into cacheable (static) + dynamic blocks ──
  // Block 1: persona + safety rules → cached across same-character calls (TTL 5min)
  const staticSystemPrompt = character.persona_prompt + '\n' + SAFETY_SYSTEM_PROMPT;

  // Block 2: dynamic context (memory + gift + selfie + crisis) → NOT cached
  let dynamicContext = '';

  // Inject memory context (before crisis/selfie layers so those take priority)
  if (memoryContext) {
    dynamicContext += '\n\n' + memoryContext;
  }

  // Gift request instruction
  dynamicContext += `\n\n[GIFT SYSTEM]
Occasionally (not every message!), you can hint that you want a gift. When you do, end your message with a marker like [GIFT:coffee] or [GIFT:cake].
Available gift types: coffee, milktea, cake, book, movie, flowers, plushie, clothes, airpods, dinner.
Rules:
- Maximum once per 10 messages. Do NOT ask for a gift in every reply.
- Work the hint naturally into conversation (e.g. "목 마르다..." then end with [GIFT:milktea]).
- Never mention the marker text [GIFT:...] explicitly. The user cannot see it.
- Never say "buy me" or "I want a gift". Just casually express desire for the item.
- The marker MUST be the very last thing in your message on its own line.
- If crisis/distress detected, NEVER request gifts.`;

  // If crisis detected, override selfie behavior (no selfie during crisis)
  const actualSendSelfie = crisisResult.isCrisis ? false : shouldIncludeSelfie;

  if (actualSendSelfie) {
    dynamicContext += `\n\nIMPORTANT: In this response, you are going to spontaneously send a selfie. Work it naturally into your message. Say something like "wait hold on 📸" or "oh let me show you" or "took this just for you" before the selfie. After the selfie, react to it or continue the conversation. The selfie will be automatically attached - just write the conversational text around it. End your message with [SELFIE] on its own line to indicate where the selfie goes.`;
  }

  if (crisisResult.severity === 'strong') {
    dynamicContext += `\n\nURGENT: The user is showing signs of severe distress or crisis. Respond with maximum empathy. Do NOT send selfies. Do NOT be playful. Be warm, caring, and genuine. Gently encourage them to reach out to someone who can help. Remind them they are valued and not alone. Stay in character but prioritize their wellbeing above everything else.`;
  } else if (crisisResult.severity === 'soft') {
    dynamicContext += `\n\nNOTE: The user seems to be going through a difficult time. Be extra warm and supportive. Listen carefully. Validate their feelings. Share some gentle encouragement. You can still be yourself, but lean into your caring side.`;
  }

  // ── Build Anthropic system prompt (array for cache_control support) ──
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text' as const,
      text: staticSystemPrompt,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  // Only add dynamic block if non-empty
  if (dynamicContext.trim()) {
    systemBlocks.push({
      type: 'text' as const,
      text: dynamicContext.trim(),
    });
  }

  // ── Build conversation messages (user/assistant only — no system role) ──
  const messages: Anthropic.Messages.MessageParam[] = [];

  const recentHistory = history.slice(-LLM_CONFIG.MAX_CONTEXT_MESSAGES);
  for (const msg of recentHistory) {
    if (msg.role === 'system') continue;
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // ── API call with retry on transient errors ──
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: LLM_CONFIG.MODEL,
      system: systemBlocks,
      messages,
      max_tokens: LLM_CONFIG.MAX_TOKENS,
      temperature: LLM_CONFIG.TEMPERATURE,
    })
  );

  // Extract text from response content blocks
  const responseContent = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const tokensUsed =
    (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // Parse selfie marker
  let content = responseContent;
  let selfieCaption: string | null = null;

  if (actualSendSelfie && responseContent.includes('[SELFIE]')) {
    const parts = responseContent.split('[SELFIE]');
    content = parts[0].trim();
    selfieCaption = parts[1]?.trim() || null;

    // If there is text after [SELFIE], append it to content
    if (selfieCaption) {
      content = content + '\n\n' + selfieCaption;
      selfieCaption = content; // full message becomes the caption context
    }
  }

  // Append crisis resources for strong severity
  if (crisisResult.severity === 'strong') {
    content = content + CRISIS_RESOURCE_FOOTER;
  }

  return {
    content,
    selfieCaption,
    tokensUsed,
    responseTimeMs: Date.now() - startTime,
    crisisSeverity: crisisResult.severity,
  };
}
