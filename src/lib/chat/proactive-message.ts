import OpenAI from 'openai';
import { LLM_CONFIG } from '@/config/constants';
import type { MemoryRow, DbCharacter } from '@/types';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export type ProactiveCategory =
  | 'comeback'      // 오래 접속 안 한 유저
  | 'morning'       // 아침 인사
  | 'evening'       // 저녁 인사
  | 'miss_you'      // 보고싶다
  | 'follow_up'     // 메모리 기반 후속 질문 (면접 어땠어? 등)
  | 'random';       // 일상 공유

export interface ProactiveMessageResult {
  content: string;
  category: ProactiveCategory;
  memoryKeysUsed: string[];
  tokensUsed: number;
  durationMs: number;
}

const PROACTIVE_SYSTEM_PROMPT = `You are generating a proactive push notification message as an AI companion character.

Rules:
1. Write ONLY the message text. No JSON, no labels, no explanation.
2. Keep it short: 1-2 sentences max (under 100 characters preferred for push notification).
3. Sound natural and in-character. Use casual tone, emojis sparingly.
4. If memory context is provided, reference it naturally (don't force it).
5. The goal is to make the user smile and want to open the app.
6. Write in Korean unless the user's language preference says otherwise.
7. Never mention that you're an AI or that you "remember" things explicitly.
8. For follow_up category: ask about a specific event/plan the user mentioned.
9. For comeback: express that you missed them without being guilt-trippy.
10. For morning/evening: keep it light and warm.`;

/**
 * Generate a personalized proactive message using character persona + user memories.
 * This function is infra-independent: call it from Cron, Edge Function, or manual trigger.
 *
 * @param character - The AI character sending the message
 * @param memories - User memories for personalization
 * @param category - Type of proactive message
 * @param hoursInactive - How long since user's last message (for comeback context)
 */
export async function generateProactiveMessage(
  character: DbCharacter,
  memories: MemoryRow[],
  category: ProactiveCategory,
  hoursInactive?: number
): Promise<ProactiveMessageResult> {
  const startTime = Date.now();
  const openai = getOpenAI();

  // Build memory context
  const memoryKeysUsed: string[] = [];
  let memoryContext = '';

  if (memories.length > 0) {
    const relevantMemories = selectRelevantMemories(memories, category);
    if (relevantMemories.length > 0) {
      memoryContext = '\n\nYou know these things about the user:\n' +
        relevantMemories.map((m) => {
          memoryKeysUsed.push(m.memory_key);
          return `- ${m.memory_key}: ${m.memory_value}`;
        }).join('\n');
    }
  }

  // Build user prompt
  let userPrompt = `Character: ${character.name} (${character.gender === 'female' ? '여성' : '남성'})\n`;
  userPrompt += `Personality: ${character.personality_tags.join(', ')}\n`;
  userPrompt += `Message category: ${category}\n`;

  if (hoursInactive !== undefined) {
    userPrompt += `User has been inactive for ${Math.round(hoursInactive)} hours.\n`;
  }

  userPrompt += memoryContext;
  userPrompt += '\n\nGenerate ONE short proactive message:';

  try {
    const completion = await openai.chat.completions.create({
      model: LLM_CONFIG.MODEL,
      messages: [
        { role: 'system', content: character.persona_prompt + '\n' + PROACTIVE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 100,
      temperature: 0.9,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    const tokensUsed =
      (completion.usage?.prompt_tokens || 0) +
      (completion.usage?.completion_tokens || 0);

    return {
      content,
      category,
      memoryKeysUsed,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[ProactiveMessage] Generation failed:', error);
    return {
      content: '',
      category,
      memoryKeysUsed: [],
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Select memories most relevant to the proactive message category.
 * Keeps token usage low by filtering to what matters.
 */
function selectRelevantMemories(
  memories: MemoryRow[],
  category: ProactiveCategory
): MemoryRow[] {
  switch (category) {
    case 'follow_up': {
      // Prioritize events and emotions (things to follow up on)
      const events = memories.filter((m) => m.memory_type === 'event');
      const emotions = memories.filter((m) => m.memory_type === 'emotion');
      return [...events, ...emotions].slice(0, 5);
    }

    case 'morning':
    case 'evening': {
      // Name + preferences + recent emotion
      const name = memories.filter((m) => m.memory_key === 'name');
      const prefs = memories.filter((m) => m.memory_type === 'preference');
      const recentEmotion = memories
        .filter((m) => m.memory_type === 'emotion')
        .slice(0, 1);
      return [...name, ...prefs.slice(0, 2), ...recentEmotion];
    }

    case 'comeback': {
      // Name + facts + last known emotion/event
      const name = memories.filter((m) => m.memory_key === 'name');
      const facts = memories.filter((m) => m.memory_type === 'fact').slice(0, 3);
      const lastEvent = memories
        .filter((m) => m.memory_type === 'event')
        .slice(0, 1);
      return [...name, ...facts, ...lastEvent];
    }

    case 'miss_you':
    case 'random':
    default: {
      // Name + a few random facts/preferences
      const name = memories.filter((m) => m.memory_key === 'name');
      const others = memories
        .filter((m) => m.memory_key !== 'name')
        .slice(0, 3);
      return [...name, ...others];
    }
  }
}
