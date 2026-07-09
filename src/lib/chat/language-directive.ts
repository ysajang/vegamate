import type { DbMessage } from '@/types';
import {
  detectLanguageFromMessages,
  detectLanguageFromText,
} from './proactive-message';

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
 *
 * Tier order stays exactly section 19 (actual conversation → profile → 'en');
 * WITHIN the conversation tier, detection is newest-first per message: the
 * most recent user message with a confident detection wins. This honors a
 * mid-conversation language switch ("let's talk in English") that the old
 * whole-history blob scan drowned out — old Hangul in the last 30 messages
 * kept outvoting the switch (prod report 2026-07-09). Short/ambiguous latest
 * messages ("ok", "ㅎ") walk back to the previous confident message, so the
 * conversation language is inherited, not reset.
 *
 * Only USER turns count as evidence — assistant turns are excluded so an AI
 * Korean leak can never self-reinforce the wrong detection.
 */
export function resolveResponseLanguage(
  history: DbMessage[],
  currentUserMessage: string,
  profileLanguage?: string | null
): string {
  const userTexts = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content);
  userTexts.push(currentUserMessage ?? '');

  // Newest → oldest: first confident single-message detection wins.
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const detected = detectLanguageFromText(userTexts[i]);
    if (detected) return detected;
  }

  // No single message was confident (all very short) → aggregate blob scan,
  // then profile, then 'en' (unchanged section-19 fallback chain).
  const withCurrent: DbMessage[] = userTexts.map(
    (content) => ({ role: 'user', content } as DbMessage)
  );
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

/**
 * END-of-prompt language reminder for non-Korean targets, appended as the last
 * dynamic-context lines (closest to generation).
 *
 * Why it exists: prod 2026-07-09 4:03PM — with ~30 Korean history messages and
 * a Korean-flavored persona, Haiku ignored the TOP-of-prompt directive and even
 * demanded the user switch back to Korean ("한국말로 해 제발"). Weak models weight
 * recent tokens heavily; the rule must also be the last thing they read.
 * Returns null for ko / unresolved — no reminder needed.
 */
export function buildLanguageReminder(lang: string | null): string | null {
  if (!lang || lang === 'ko') return null;
  const name = languageName(lang);
  return (
    `[LANGUAGE CHECK — FINAL RULE]\n` +
    `Write your ENTIRE reply in ${name}. Zero Korean characters or Korean slang (ㅋㅋ/ㅎㅎ/ㅠㅠ). ` +
    `The user is writing in ${name} — follow THEM immediately. Never ask the user to switch languages, ` +
    `never complain about their language choice, never reply in Korean "in character". ` +
    `Your personality stays the same; only the language is ${name}.`
  );
}

/**
 * Corrective system block for the single leak-retry. Injected when a generated
 * reply for a non-Korean target still contained Korean.
 */
export function buildLanguageViolationCorrective(lang: string): string {
  const name = languageName(lang);
  return (
    `[CRITICAL — LANGUAGE VIOLATION]\n` +
    `Your previous draft violated the language rule: it contained Korean. ` +
    `REWRITE your reply to the user's last message entirely in ${name} — no Korean characters, ` +
    `no Korean slang, only in ${name}. Keep the same personality, warmth, and intent.`
  );
}

/** Should this generated content trigger the one-shot language retry? */
export function needsLanguageRetry(
  content: string,
  responseLanguage: string | null | undefined
): boolean {
  return Boolean(
    responseLanguage && responseLanguage !== 'ko' && containsKoreanLeak(content)
  );
}
