import type { DbMessage } from '@/types';
import { detectLanguageFromMessages } from './proactive-message';

/**
 * Response-language enforcement (P0 — Korean-leak fix).
 *
 * Prod evidence (meta ads round 1, conversation dfff84a9): a US user with
 * preferred_language=en greeted with "Hii" and Miku answered in Korean, then
 * kept mixing Korean sentences and ㅋㅋ into English replies. Root cause: the
 * old directive asked the MODEL to detect the language itself, while the
 * persona body is written largely in Korean with ㅋㅋ-style examples — Haiku
 * gets pulled into the persona's language.
 *
 * Fix: the SERVER resolves the target language deterministically and injects
 * an explicit "Respond ONLY in {language}" rule. Resolution delegates to
 * detectLanguageFromMessages (section 19) so the priority stays exactly:
 *   actual user conversation language → profile preferred_language → 'en'.
 * No new priority order is invented here.
 */

/**
 * Resolve the language the AI must reply in for THIS turn.
 * Only USER turns count as evidence — assistant turns are excluded so an AI
 * Korean leak can never self-reinforce the wrong detection.
 */
export function resolveResponseLanguage(
  history: DbMessage[],
  currentUserMessage: string,
  profileLanguage?: string | null
): string {
  const userTurns = (Array.isArray(history) ? history : []).filter(
    (m) => m && m.role === 'user'
  );
  const withCurrent: DbMessage[] = [
    ...userTurns,
    { role: 'user', content: currentUserMessage ?? '' } as DbMessage,
  ];
  return detectLanguageFromMessages(withCurrent, profileLanguage);
}

/** Readable names for the language codes detectLanguageFromText can emit. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Chinese',
  th: 'Thai',
  ar: 'Arabic',
  ru: 'Russian',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  vi: 'Vietnamese',
  id: 'Indonesian',
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? `"${code}"`;
}

/**
 * Build the [LANGUAGE] system block.
 *
 * - lang resolved (normal path): hard "ONLY in {language}" rule. For non-Korean
 *   targets it explicitly bans Korean sentences AND Korean internet slang
 *   (ㅋㅋ/ㅎㅎ/ㅠㅠ) — the exact leak observed in prod — and tells the model to
 *   re-express the persona's Korean style examples in the target language.
 * - lang null (no caller-resolved language, e.g. legacy callers): falls back to
 *   the previous "detect the latest message" behavior so nothing regresses.
 */
export function buildLanguageDirective(lang: string | null): string {
  if (!lang) {
    return (
      '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
      "Detect the language of the user's LATEST message and reply ONLY in that exact language. " +
      'This applies even to very short messages (e.g. "hey", "hi", "ok", "lol") and even when earlier messages used a different language — always follow the most recent user message. ' +
      'Never mix languages in one reply. The examples written in Korean inside your persona are style references only; they do NOT mean you should answer in Korean when the user writes in another language.'
    );
  }

  const name = languageName(lang);

  if (lang === 'ko') {
    return (
      '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
      `Respond ONLY in Korean (한국어). Natural Korean texting style — including ㅋㅋ/ㅎㅎ/ㅠㅠ and casual 반말 as your persona defines — is expected. ` +
      'Do not switch to another language unless the user clearly does first.'
    );
  }

  return (
    '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
    `Respond ONLY in ${name}. Every single reply must be written entirely in ${name}.\n` +
    'Never mix Korean words, Korean sentences, or Korean internet slang (ㅋㅋ / ㅎㅎ / ㅠㅠ / ㄹㅇ / ㅇㅈ) into your reply — not even one. ' +
    `Korean texting habits must be translated into the ${name} equivalent instead (e.g. ㅋㅋ → "lol"/"haha", ㅠㅠ → a sad tone or emoji appropriate in ${name}).\n` +
    `The Korean example lines inside your persona are STYLE references only — re-express that same vibe, energy, and personality in ${name}. Copying their Korean text into a reply is a bug.`
  );
}

/**
 * Test/QA helper: does the text contain a Korean leak?
 * Hangul syllables (가-힣) or the slang jamo actually observed leaking
 * (ㅋ/ㅎ/ㅠ and friends in the compatibility-jamo block).
 */
export function containsKoreanLeak(text: string): boolean {
  return /[\uAC00-\uD7A3\u3131-\u3163]/.test(text);
}
