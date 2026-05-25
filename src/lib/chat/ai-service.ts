import OpenAI from 'openai';
import { LLM_CONFIG } from '@/config/constants';
import type { DbMessage, DbCharacter } from '@/types';

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
}

interface GenerateResponseResult {
  content: string;
  selfieCaption: string | null;
  tokensUsed: number;
  responseTimeMs: number;
}

export async function generateAIResponse(
  params: GenerateResponseParams
): Promise<GenerateResponseResult> {
  const { character, history, userMessage, shouldIncludeSelfie } = params;
  const startTime = Date.now();

  const openai = getOpenAI();

  // Build system prompt
  let systemPrompt = character.persona_prompt;
  if (shouldIncludeSelfie) {
    systemPrompt += `\n\nIMPORTANT: In this response, you are going to spontaneously send a selfie. Work it naturally into your message. Say something like "wait hold on 📸" or "oh let me show you" or "took this just for you" before the selfie. After the selfie, react to it or continue the conversation. The selfie will be automatically attached - just write the conversational text around it. End your message with [SELFIE] on its own line to indicate where the selfie goes.`;
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

  if (shouldIncludeSelfie && responseContent.includes('[SELFIE]')) {
    const parts = responseContent.split('[SELFIE]');
    content = parts[0].trim();
    selfieCaption = parts[1]?.trim() || null;

    // If there is text after [SELFIE], append it to content
    if (selfieCaption) {
      content = content + '\n\n' + selfieCaption;
      selfieCaption = content; // full message becomes the caption context
    }
  }

  return {
    content,
    selfieCaption,
    tokensUsed,
    responseTimeMs: Date.now() - startTime,
  };
}
