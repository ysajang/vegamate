import { LLM_CONFIG } from '@/config/constants';
import type { DbMessage, ExtractedMemory, MemoryType } from '@/types';
import { getAnthropicClient, withRetry } from './anthropic-client';

// ── Sensitive info patterns to filter ───────────────────────
const SENSITIVE_PATTERNS = [
  /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/,          // Korean phone numbers
  /\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b/,         // General phone numbers
  /\b\d{6}[-]?\d{7}\b/,                       // Korean resident registration
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|court|ct|boulevard|blvd|로|길|동|구)\b/i, // Addresses
  /\b(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*(?:시|도)?\s*\S+(?:구|군|시)\s*\S+(?:동|읍|면|리|로|길)\s*\d*/i, // Korean addresses
];

const VALID_MEMORY_TYPES: MemoryType[] = ['fact', 'preference', 'event', 'emotion'];

/**
 * Keys/values that must NEVER be stored, even if the prompt lets them through.
 * Two classes:
 *  - relationship/intimacy: the AI must never persist how the user "feels about" it
 *    or any claimed closeness — that breaks the earned-intimacy illusion.
 *  - ephemeral state: momentary facts that are false within the hour and would
 *    otherwise get replayed as if permanent ("you're resting", "you haven't eaten").
 */
const BLOCKED_KEY_PATTERNS = [
  /relationship/i,
  /intimacy/i,
  /closeness/i,
  /^current_/i,
  /_status$/i,
  /^meal/i,
  /appetite/i,
  /mood$/i,
  /right_now/i,
  /currently/i,
  /created?_ai/i,
  /creator/i,
  /made_(the_|this_)?(ai|character|me)/i,
];
const BLOCKED_VALUE_PATTERNS = [
  /내\s*사람|너의\s*사람|상대방의\s*사람/,            // "my/your person"
  /친밀한?\s*관계|연인|사귀/,                          // intimate relationship / dating
  /(my|your)\s+person|close\s+relationship|dating|in\s+a\s+relationship/i,
  /쉬고\s*있|쉬는\s*중|resting\s+now|입맛이?\s*없|밥을?\s*(아직\s*)?(안|않)/, // transient now-state
];

function isBlockedMemory(key: string, value: string): boolean {
  if (BLOCKED_KEY_PATTERNS.some((p) => p.test(key))) return true;
  if (BLOCKED_VALUE_PATTERNS.some((p) => p.test(value))) return true;
  return false;
}

/** Check if value contains sensitive PII */
function containsSensitiveInfo(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

/** Validate and sanitize extracted memories */
function validateExtractedMemories(raw: unknown): ExtractedMemory[] {
  if (!Array.isArray(raw)) return [];

  const validated: ExtractedMemory[] = [];

  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.key !== 'string' ||
      typeof item.value !== 'string'
    ) {
      continue;
    }

    const key = item.key.trim().toLowerCase().replace(/\s+/g, '_');
    const value = item.value.trim();

    // Skip empty or too-short values
    if (!key || key.length > 50 || !value || value.length > 500) continue;

    // Filter sensitive info
    if (containsSensitiveInfo(value)) continue;

    // Filter relationship/ephemeral memories (2nd-layer defense behind the prompt)
    if (isBlockedMemory(key, value)) continue;

    // Validate type
    const type: MemoryType = VALID_MEMORY_TYPES.includes(item.type)
      ? item.type
      : 'fact';

    // Validate confidence
    const confidence =
      typeof item.confidence === 'number'
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.7;

    validated.push({ key, value, type, confidence });
  }

  return validated;
}

// ── Extraction prompt ───────────────────────────────────────
const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation and extract NEW, DURABLE facts about the user.

Rules:
1. Only extract facts the USER explicitly stated about THEMSELVES. If the user did not say it, do not extract it.
2. NEVER extract anything from the AI character's messages. The AI's claims, pet names, or feelings are NOT facts about the user. (Critical: if the AI said "you're my person" / "넌 내 사람이야", that is NOT a user fact — ignore it completely.) Also NEVER store meta claims about the AI itself, such as the user "created/made this AI", "is my creator", "내가 너를 만들었다" — these are role-play noise, not durable user facts.
3. NEVER extract relationship status, intimacy level, or how the user feels about the AI (e.g. "is my person", "close relationship", "loves me", "친밀한 관계", "연인"). Relationship is shown through behavior over time, never stored as a fact.
4. Extract ONLY durable, lasting facts — things that stay true across days/weeks. Examples: name, age, job, hometown, hobbies, stable preferences, pets, family, recurring situations, significant upcoming events.
5. NEVER extract momentary/transient states that will be false in an hour. DO NOT store: what they're doing right now ("쉬는 중", "resting"), current hunger/meal status ("밥 안 먹음", "입맛 없음"), passing moods tied to this exact moment, "current_activity", "meal_status", "current_appetite" and similar. These are conversation context, NOT memory.
6. An emotion is only worth storing if it reflects a lasting situation (e.g. "stressed about an ongoing job search"), never a momentary feeling in this chat.
7. Do NOT extract generic conversation topics (e.g. "talked about weather").
8. Use short, specific keys in snake_case (e.g. "pet_name", "favorite_food", "job_title", "hometown").
9. Values should be concise but complete.
10. Do NOT extract phone numbers, email addresses, home addresses, or ID numbers.
11. Assign confidence 0.5-1.0 based on how explicitly the USER stated it. If you are inferring rather than quoting the user, stay below 0.7.

When in doubt, extract NOTHING. A wrong or transient memory is far worse than a missing one — it breaks the illusion later.

Respond ONLY with a JSON array. No markdown fences, no explanation, no preamble. Just the raw JSON array.
If nothing new and durable to extract, respond with exactly: []

Example output:
[
  {"key": "name", "value": "승재", "type": "fact", "confidence": 0.95},
  {"key": "job", "value": "프리랜서 개발자", "type": "fact", "confidence": 0.9},
  {"key": "favorite_food", "value": "라면", "type": "preference", "confidence": 0.8},
  {"key": "upcoming_event", "value": "다음 주 면접이 있음", "type": "event", "confidence": 0.85}
]`;

export interface ExtractionResult {
  memories: ExtractedMemory[];
  tokensUsed: number;
  durationMs: number;
}

/**
 * Extract user memories from a batch of recent messages.
 * Called every N turns (not every message) for cost optimization.
 */
export async function extractMemories(
  messages: DbMessage[],
  existingMemoryContext?: string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  if (messages.length === 0) {
    return { memories: [], tokensUsed: 0, durationMs: 0 };
  }

  // Build conversation text for extraction
  const conversationText = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n');

  // Include existing memories to avoid re-extracting
  let userPrompt = `Analyze this conversation and extract NEW facts about the user:\n\n${conversationText}`;

  if (existingMemoryContext) {
    userPrompt += `\n\nAlready known facts (do NOT re-extract these unless updated):\n${existingMemoryContext}`;
  }

  const anthropic = getAnthropicClient();

  try {
    const response = await withRetry(() =>
      anthropic.messages.create({
        model: LLM_CONFIG.MODEL,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.1, // low temperature for consistent extraction
      })
    );

    // Extract text from response
    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('');

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    // Parse response - handle both array and object-wrapped array
    let parsed: unknown;
    try {
      // Strip any markdown fences Claude might add despite instructions
      const cleaned = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
      // If wrapped in object (e.g. {"memories": [...]}), unwrap
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        parsed = obj.memories || obj.facts || obj.data || [];
      }
    } catch {
      console.warn('[MemoryExtraction] Failed to parse JSON:', responseText);
      return { memories: [], tokensUsed, durationMs: Date.now() - startTime };
    }

    const memories = validateExtractedMemories(parsed);

    return {
      memories,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[MemoryExtraction] Anthropic call failed:', error);
    return { memories: [], tokensUsed: 0, durationMs: Date.now() - startTime };
  }
}
