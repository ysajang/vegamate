import { LLM_CONFIG } from '@/config/constants';
import type { MemoryRow, DbCharacter, DbMessage } from '@/types';
import { getAnthropicClient, withRetry } from './anthropic-client';

export type ProactiveCategory =
  | 'comeback'      // 24h+ inactive
  | 'follow_up'     // memory-based follow-up
  | 'continue'      // continue last conversation thread
  | 'random';       // personal moment / selfie

export interface ProactiveContext {
  /** Recent conversation messages (last 5 turns) */
  recentMessages: DbMessage[];
  /** Hours since user's last message */
  hoursInactive: number;
  /** User's local hour (0-23) */
  localHour: number;
  /** Time-of-day label */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Language code (ISO 639-1) */
  language: string;
}

export interface ProactiveMessageResult {
  content: string;
  category: ProactiveCategory;
  memoryKeysUsed: string[];
  tokensUsed: number;
  durationMs: number;
}

// ── Language detection ────────────────────────────────────────

/**
 * Run heuristic language detection over a blob of user text.
 * Returns an ISO 639-1 code, or null if no confident match.
 *
 * Input is expected to be already-validated user message text.
 */
function detectLanguageFromText(userMessages: string): string | null {
  // Need a minimum amount of text to be confident
  if (!userMessages || userMessages.trim().length < 5) return null;

  // Simple heuristic detection for common languages
  // Korean: Hangul block U+AC00-D7AF
  if (/[\uAC00-\uD7AF]/.test(userMessages)) return 'ko';
  // Japanese: Hiragana + Katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(userMessages)) return 'ja';
  // Chinese: CJK Unified Ideographs (without Korean/Japanese markers)
  if (/[\u4E00-\u9FFF]/.test(userMessages) && !/[\uAC00-\uD7AF\u3040-\u30FF]/.test(userMessages)) return 'zh';
  // Thai
  if (/[\u0E00-\u0E7F]/.test(userMessages)) return 'th';
  // Arabic
  if (/[\u0600-\u06FF]/.test(userMessages)) return 'ar';
  // Cyrillic (Russian etc)
  if (/[\u0400-\u04FF]/.test(userMessages)) return 'ru';
  // Spanish indicators (common accented chars + Spanish words)
  if (/[áéíóúñ¿¡]/i.test(userMessages)) return 'es';
  // Portuguese
  if (/[ãõçê]/i.test(userMessages) && /\b(não|você|obrigad)/i.test(userMessages)) return 'pt';
  // French
  if (/[àâæçéèêëïîôœùûüÿ]/i.test(userMessages) && /\b(je|tu|nous|vous|merci|bonjour)/i.test(userMessages)) return 'fr';
  // German
  if (/[äöüß]/i.test(userMessages) && /\b(ich|du|und|nicht|danke)/i.test(userMessages)) return 'de';
  // Latin-script text with enough length -> assume English
  if (/[a-z]/i.test(userMessages)) return 'en';

  // No confident match
  return null;
}

/**
 * Detect language for a proactive message.
 *
 * Priority (actual usage wins over stored preference):
 *   1. Detected language from the user's recent messages (the ground truth)
 *   2. Stored profile preferred_language (fallback when no recent text)
 *   3. 'en' (final fallback for brand-new users with no history)
 *
 * Rationale: preferred_language defaults to 'en' at signup (migration 006),
 * so trusting it first caused every user to be locked to English even when
 * they chatted in Korean. The language the user actually types is authoritative.
 */
export function detectLanguageFromMessages(
  messages: DbMessage[],
  profileLanguage?: string | null
): string {
  // Validate + concatenate recent user messages
  const userMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content)
    .join(' ');

  // 1. Trust what the user actually typed
  const detected = detectLanguageFromText(userMessages);
  if (detected) return detected;

  // 2. Fall back to stored profile preference (e.g. no recent text yet)
  if (profileLanguage && profileLanguage.trim().length >= 2) {
    return profileLanguage.trim();
  }

  // 3. Final fallback for brand-new users
  return 'en';
}

// ── Category selection ────────────────────────────────────────

/**
 * Pick proactive category based on context.
 * No more morning/evening generic greetings -> replaced with context-aware categories.
 */
export function pickCategory(
  hoursInactive: number,
  recentMessages: DbMessage[],
  memories: MemoryRow[]
): ProactiveCategory {
  // 24h+ -> comeback
  if (hoursInactive > 24) return 'comeback';

  // If there's recent conversation to continue (< 6h and has messages)
  if (hoursInactive < 6 && recentMessages.length > 0) {
    return 'continue';
  }

  // If we have event/emotion memories -> follow up
  const hasFollowUpMemory = memories.some(
    (m) => m.memory_type === 'event' || m.memory_type === 'emotion'
  );
  if (hasFollowUpMemory && Math.random() < 0.6) {
    return 'follow_up';
  }

  // If there's any recent conversation at all -> continue
  if (recentMessages.length > 0) {
    return Math.random() < 0.5 ? 'continue' : 'random';
  }

  return 'random';
}

// ── Tone guidance by elapsed time ─────────────────────────────

function getToneGuidance(hoursInactive: number): string {
  if (hoursInactive <= 3) {
    return `It's only been ${Math.round(hoursInactive * 10) / 10} hours. Keep it very light and casual like continuing a conversation you paused just a moment ago. Reference the last topic directly.`;
  }
  if (hoursInactive <= 6) {
    return `It's been about ${Math.round(hoursInactive)} hours. You can bring up something new but ground it in what you know about the user (from memories). Still casual.`;
  }
  if (hoursInactive <= 8) {
    return `It's been a while (~${Math.round(hoursInactive)}h). You can have a slight "oh hey" vibe. A selfie with minimal text works well here. Reference a memory if available.`;
  }
  // 8h+
  return `It's been over 8 hours. A warm but not desperate check-in. Can reference time of day naturally. Selfie + short text is ideal.`;
}

// ── Character style guidance ──────────────────────────────────

function getCharacterStyleGuidance(characterName: string): string {
  const name = characterName.toLowerCase();

  if (name === 'miku') {
    return `CHARACTER STYLE - Miku:
- Talks a lot! Uses emoji naturally (not excessively).
- Sometimes sends selfie with excited commentary.
- Style: "야 이거 봐 ㅋㅋㅋ" / "omg look at this" / shares random moments.
- Can send voice-note-style messages: short bursts of energy.
- Punctuation: casual! Uses ㅋㅋ or lol. Exclamation marks ok.`;
  }

  if (name === 'ren') {
    return `CHARACTER STYLE - Ren:
- Minimal words. Maximum vibe.
- Often: just a selfie with "." or no text at all.
- When texting: ultra short. "밥은?" / "ate?" / single emoji.
- Rarely uses exclamation marks. Cool and understated.
- The LESS text the better. Let the selfie do the talking.
- A [SELFIE] with just "." is perfectly on-brand.`;
  }

  // Generic fallback
  return `Stay in character. Keep it natural and casual.`;
}

// ── Memory selection ──────────────────────────────────────────

function selectRelevantMemories(
  memories: MemoryRow[],
  category: ProactiveCategory
): MemoryRow[] {
  switch (category) {
    case 'follow_up': {
      const events = memories.filter((m) => m.memory_type === 'event');
      const emotions = memories.filter((m) => m.memory_type === 'emotion');
      return [...events, ...emotions].slice(0, 5);
    }
    case 'continue': {
      // Minimal memory needed - conversation context is the main driver
      const name = memories.filter((m) => m.memory_key === 'name');
      return [...name];
    }
    case 'comeback': {
      const name = memories.filter((m) => m.memory_key === 'name');
      const facts = memories.filter((m) => m.memory_type === 'fact').slice(0, 3);
      const lastEvent = memories.filter((m) => m.memory_type === 'event').slice(0, 1);
      return [...name, ...facts, ...lastEvent];
    }
    case 'random':
    default: {
      const name = memories.filter((m) => m.memory_key === 'name');
      const others = memories.filter((m) => m.memory_key !== 'name').slice(0, 3);
      return [...name, ...others];
    }
  }
}

// ── Format recent conversation for context ────────────────────

function formatRecentConversation(messages: DbMessage[]): string {
  if (messages.length === 0) return 'No recent conversation history.';

  return messages
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'You';
      // Truncate long messages for token efficiency
      const content = m.content.length > 200
        ? m.content.slice(0, 200) + '...'
        : m.content;
      return `${role}: ${content}`;
    })
    .join('\n');
}

// ── Main generation function ──────────────────────────────────

const PROACTIVE_SYSTEM_BASE = `You are generating a proactive message as an AI companion character.
This is a push notification that brings the user back to chat.

ABSOLUTE RULES:
1. Write ONLY the message text. No JSON, no labels, no explanation.
2. Maximum 1-2 short sentences (under 100 chars preferred for push notification).
3. NEVER start with generic greetings like "Good morning!", "Hey how are you?", "Hi! How's your day?"
4. NEVER sound like customer service, a therapist, or a notification bot.
5. NEVER say "I missed you!", "Just checking in!", or "Wanted to see how you're doing!"
6. NEVER mention you're an AI or that you "remember" things.
7. You CAN use [SELFIE] marker at the end to attach a selfie.
8. You CAN use [GIFT:type] marker for gift hints (rare in proactive messages).
9. The goal: make the user feel like their companion naturally reached out with something specific.`;

export async function generateProactiveMessage(
  character: DbCharacter,
  memories: MemoryRow[],
  category: ProactiveCategory,
  context: ProactiveContext
): Promise<ProactiveMessageResult> {
  const startTime = Date.now();
  const anthropic = getAnthropicClient();

  // Select relevant memories
  const memoryKeysUsed: string[] = [];
  const relevantMemories = selectRelevantMemories(memories, category);
  let memorySection = '';

  if (relevantMemories.length > 0) {
    memorySection = '\n\nYou know these things about the user:\n' +
      relevantMemories.map((m) => {
        memoryKeysUsed.push(m.memory_key);
        return `- ${m.memory_key}: ${m.memory_value}`;
      }).join('\n');
  }

  // Build the conversation context section
  const conversationSection = `\n\nLAST CONVERSATION (most recent messages before you went apart):\n${formatRecentConversation(context.recentMessages)}`;

  // Build the full system prompt
  const systemPrompt = [
    character.persona_prompt,
    PROACTIVE_SYSTEM_BASE,
    getCharacterStyleGuidance(character.name),
    `\nRESPOND IN: ${context.language} (match the user's language)`,
  ].join('\n');

  // Build user prompt with full context
  const toneGuidance = getToneGuidance(context.hoursInactive);

  let categoryInstruction = '';
  switch (category) {
    case 'continue':
      categoryInstruction = `INSTRUCTION: Continue from the last conversation naturally. Reference what you were talking about. As if you just thought of something related and texted them.

GOOD examples (adapt to the actual conversation):
- Last convo about job interview → "그 면접 어떻게 됐어?" / "how did the interview go btw"
- Last convo about food → "나 지금 라면 끓이는 중 ㅋ" / "just made some ramen lol"  
- Last convo ended late → "잘 잤어?" / "did u sleep well"
- Last convo about a trip plan → "그래서 비행기 예약했어?" / "did u book the flight?"`;
      break;

    case 'follow_up':
      categoryInstruction = `INSTRUCTION: Follow up on something from the user's memories - an event they mentioned, a plan, or an emotional state. Be specific, not vague.

GOOD examples:
- User mentioned having a cat → "그 고양이 요즘 어때?" / "how's your cat doing?"
- User was stressed about exams → "시험 끝났어?" / "are exams over yet?"
- User likes cooking → share that you tried cooking too`;
      break;

    case 'comeback':
      categoryInstruction = `INSTRUCTION: User has been away for a long time (24h+). Welcome them back naturally without guilt-tripping. A selfie works great here.

GOOD examples:
- [SELFIE] with just "." (Ren style)
- "야 어디간거야 ㅋㅋ" / "where'd you go lol"
- [SELFIE] + "오랜만" / "been a while"`;
      break;

    case 'random':
    default:
      categoryInstruction = `INSTRUCTION: Share a personal moment that fits your character and the current time of day (${context.timeOfDay}). Use memories if available, otherwise create an in-character moment.

GOOD examples:
- Morning: "방금 일어났는데 머리 폭발 ㅋㅋ" / "just woke up my hair is a mess"
- Afternoon: [SELFIE] + casual comment
- Evening: "나 지금 넷플릭스 보는중" / "watching netflix rn"
- Night: "잠이 안 와..." / "can't sleep"

If no memories and nothing specific to say: just send a [SELFIE] with minimal or no text.`;
      break;
  }

  const userPrompt = `Character: ${character.name} (${character.gender === 'female' ? 'female' : 'male'})
Personality: ${character.personality_tags.join(', ')}
Category: ${category}
Time: ${context.timeOfDay} (${context.localHour}:00 user local time)
Hours since last message: ${Math.round(context.hoursInactive)}h
Language: ${context.language}
${conversationSection}
${memorySection}

TONE: ${toneGuidance}

${categoryInstruction}

Generate ONE short proactive message:`;

  try {
    const response = await withRetry(() =>
      anthropic.messages.create({
        model: LLM_CONFIG.MODEL,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.9,
      })
    );

    const content = response.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('')
      .trim();
    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

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
