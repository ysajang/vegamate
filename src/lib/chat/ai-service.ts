import OpenAI from 'openai';
import { LLM_CONFIG } from '@/config/constants';
import type { DbMessage, DbCharacter } from '@/types';
import { detectCrisis, SAFETY_SYSTEM_PROMPT, CRISIS_RESOURCE_FOOTER } from './safety';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

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

  const openai = getOpenAI();

  // Crisis detection
  const crisisResult = detectCrisis(userMessage);

  // Build system prompt with safety layer always present
  let systemPrompt = character.persona_prompt + '\n' + SAFETY_SYSTEM_PROMPT;

  // Inject memory context (before crisis/selfie layers so those take priority)
  if (memoryContext) {
    systemPrompt += '\n\n' + memoryContext;
  }

  // Gift request instruction — AI can hint for gifts naturally
  // The marker will be stripped before showing to user; frontend renders a gift button instead
  systemPrompt += `\n\n[GIFT SYSTEM]
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
    systemPrompt += `\n\nIMPORTANT: In this response, you are going to spontaneously send a selfie. Work it naturally into your message. Say something like "wait hold on 📸" or "oh let me show you" or "took this just for you" before the selfie. After the selfie, react to it or continue the conversation. The selfie will be automatically attached - just write the conversational text around it. End your message with [SELFIE] on its own line to indicate where the selfie goes.`;
  }

  if (crisisResult.severity === 'strong') {
    systemPrompt += `\n\nURGENT: The user is showing signs of severe distress or crisis. Respond with maximum empathy. Do NOT send selfies. Do NOT be playful. Be warm, caring, and genuine. Gently encourage them to reach out to someone who can help. Remind them they are valued and not alone. Stay in character but prioritize their wellbeing above everything else.`;
  } else if (crisisResult.severity === 'soft') {
    systemPrompt += `\n\nNOTE: The user seems to be going through a difficult time. Be extra warm and supportive. Listen carefully. Validate their feelings. Share some gentle encouragement. You can still be yourself, but lean into your caring side.`;
  }

  // Build message history (limited context window)
  const contextMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add recent history
  const recentHistory = history.slice(-LLM_CONFIG.MAX_CONTEXT_MESSAGES);
  for (const msg of recentHistory) {
    if (msg.role === 'system') continue;
    contextMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current user message
  contextMessages.push({ role: 'user', content: userMessage });

  const completion = await openai.chat.completions.create({
    model: LLM_CONFIG.MODEL,
    messages: contextMessages,
    max_tokens: LLM_CONFIG.MAX_TOKENS,
    temperature: LLM_CONFIG.TEMPERATURE,
  });

  const responseContent = completion.choices[0]?.message?.content || '';
  const tokensUsed =
    (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0);

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
