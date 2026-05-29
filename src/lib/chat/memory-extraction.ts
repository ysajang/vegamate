import OpenAI from 'openai';
import { LLM_CONFIG } from '@/config/constants';
import type { DbMessage, ExtractedMemory, MemoryType } from '@/types';

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
const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation and extract NEW facts about the user.

Rules:
1. Only extract facts the USER explicitly stated or strongly implied
2. Do NOT extract facts about the AI character
3. Do NOT extract generic conversation topics (e.g. "talked about weather")
4. Focus on personal facts: name, age, job, hobbies, preferences, relationships, pets, important events, emotional states
5. For events, include temporal context (e.g. "has a job interview tomorrow")
6. For emotions, capture the current state (e.g. "feeling stressed about work")
7. Use short, specific keys in snake_case (e.g. "pet_name", "favorite_food", "job_title")
8. Values should be concise but complete
9. Do NOT extract phone numbers, email addresses, home addresses, or ID numbers
10. Assign confidence 0.5-1.0 based on how explicitly the user stated it

Respond ONLY with a JSON array. No other text. If nothing new to extract, respond with [].

Example output:
[
  {"key": "name", "value": "승재", "type": "fact", "confidence": 0.95},
  {"key": "job", "value": "프리랜서 개발자", "type": "fact", "confidence": 0.9},
  {"key": "favorite_food", "value": "라면", "type": "preference", "confidence": 0.8},
  {"key": "upcoming_event", "value": "내일 면접이 있음", "type": "event", "confidence": 0.85},
  {"key": "current_mood", "value": "야근 때문에 피곤함", "type": "emotion", "confidence": 0.7}
]`;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

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

  const openai = getOpenAI();

  try {
    const completion = await openai.chat.completions.create({
      model: LLM_CONFIG.MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.1, // low temperature for consistent extraction
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '[]';
    const tokensUsed =
      (completion.usage?.prompt_tokens || 0) +
      (completion.usage?.completion_tokens || 0);

    // Parse response - handle both array and object-wrapped array
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
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
    console.error('[MemoryExtraction] GPT call failed:', error);
    return { memories: [], tokensUsed: 0, durationMs: Date.now() - startTime };
  }
}
