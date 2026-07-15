/**
 * Browser-language detection at signup (Notion §34, round 3 hotfix).
 *
 * `profiles.preferred_language` defaulted to 'en' and NOTHING ever wrote it,
 * so every greeting fired in English regardless of the user's language — the
 * P0-a rule (reply in the user's language) only engages once the user has
 * sent a message, and the greeting lands before that. The onboarding flow now
 * detects the browser language once and stores it, so `pickGreeting` can
 * serve greeting_i18n in the right language from the first screen.
 *
 * The supported set mirrors language-directive's LANGUAGE_NAMES; anything
 * else resolves to 'en'.
 */

export const SUPPORTED_PREFERRED_LANGUAGES = [
  'en',
  'ko',
  'ja',
  'zh',
  'th',
  'ar',
  'ru',
  'es',
  'pt',
  'fr',
  'de',
  'vi',
  'id',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_PREFERRED_LANGUAGES)[number];

/**
 * Map a BCP-47 browser language tag ("ko-KR", "en-US", "fr") to a supported
 * preferred-language code, defaulting to 'en'.
 */
export function detectPreferredLanguage(
  navigatorLanguage: string | null | undefined,
): SupportedLanguage {
  if (!navigatorLanguage || typeof navigatorLanguage !== 'string') return 'en';
  const primary = navigatorLanguage.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_PREFERRED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as SupportedLanguage)
    : 'en';
}
