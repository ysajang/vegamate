/**
 * 메시지 버블 시각을 지정 타임존 기준으로 포맷.
 *
 * 우선순위:
 *   1. 유효한 timezone(IANA) -> 해당 존으로 렌더
 *   2. timezone falsy/무효 -> 브라우저 로컬(Intl 기본) 폴백 (UTC 하드코딩 금지)
 *
 * 근본원인: 버블이 toLocaleTimeString([], {...})을 timeZone 옵션 없이 호출 →
 *   렌더링 환경(브라우저/서버)의 타임존을 사용. profiles.timezone을 반영 못 함.
 *   (예: Africa/Casablanca 유저 메시지가 KST로 표시)
 *
 * 잘못된 timezone 문자열이나 날짜는 throw 없이 안전 폴백(버블 크래시 방지).
 */
export function formatMessageTime(
  iso: string,
  timezone: string | null | undefined
): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };

  // 유효한 timezone이면 주입. 무효/falsy면 옵션 생략 -> 브라우저 로컬.
  if (timezone && timezone.trim().length > 0) {
    try {
      // 무효한 IANA면 여기서 RangeError -> catch로 로컬 폴백.
      return new Intl.DateTimeFormat([], { ...opts, timeZone: timezone }).format(
        date
      );
    } catch {
      // fall through to local
    }
  }

  return new Intl.DateTimeFormat([], opts).format(date);
}
