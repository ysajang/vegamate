/**
 * 캐릭터 첫 인사(greeting)를 유저 언어에 맞춰 선택.
 *
 * 우선순위:
 *   1. greeting_i18n[profileLanguage] — 유저 선호 언어
 *   2. greeting_i18n['en'] — 영어
 *   3. fallback — characters.greeting_message (구 단일 컬럼, en 원본)
 *
 * 빈 문자열/공백만 있는 값은 무효로 보고 다음 우선순위로 넘어간다(빈 인사 방지).
 *
 * conversation 생성 경로가 greeting_message를 언어 결정 없이 그대로 삽입해
 * ko 유저도 첫 인사가 영어로 나가던 버그(Notion §캐릭터 greeting)의 수정 지점.
 */
export function pickGreeting(
  greetingI18n: Record<string, string> | null | undefined,
  profileLanguage: string | null | undefined,
  fallback: string
): string {
  const i18n =
    greetingI18n && typeof greetingI18n === 'object' ? greetingI18n : {};

  const pick = (lang: string | null | undefined): string | null => {
    if (!lang) return null;
    const v = i18n[lang];
    if (typeof v === 'string' && v.trim().length > 0) return v;
    return null;
  };

  return pick(profileLanguage) ?? pick('en') ?? fallback;
}
