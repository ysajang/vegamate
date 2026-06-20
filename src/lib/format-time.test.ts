import { describe, it, expect } from 'vitest';
import { formatMessageTime } from './format-time';

// Spec — 메시지 버블 시각은 profiles.timezone 기준으로 렌더.
//   근본원인: toLocaleTimeString([], {...})이 timeZone 옵션 없이 호출 →
//   렌더링 디바이스(브라우저/서버)의 타임존을 씀. profiles.timezone 무시.
//   Sana(Africa/Casablanca, UTC+1) 메시지가 KST(UTC+9)로 표시됨.
//
// 고정 기준 시각: 2026-06-13T20:17:00Z (UTC)
//   Casablanca(UTC+1) -> 21:17 / Seoul(UTC+9) -> 05:17(익일) / UTC -> 20:17

const ISO = '2026-06-13T20:17:00Z';

describe('formatMessageTime', () => {
  it('Africa/Casablanca -> 현지 시각(KST 아님)', () => {
    const out = formatMessageTime(ISO, 'Africa/Casablanca');
    // 21:17 PM 형태. KST(05:17)나 UTC(20:17)가 아님.
    expect(out).toMatch(/9:17/); // 9:17 PM (12h) 또는 21:17
    expect(out).not.toMatch(/5:17/);
  });

  it('Asia/Seoul -> KST 시각', () => {
    const out = formatMessageTime(ISO, 'Asia/Seoul');
    expect(out).toMatch(/5:17/); // 05:17 익일
  });

  it('timezone null -> throw 없이 문자열 반환 (브라우저 로컬 폴백)', () => {
    const out = formatMessageTime(ISO, null);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('timezone 빈문자열 -> 폴백 (throw 없음)', () => {
    const out = formatMessageTime(ISO, '');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('잘못된 IANA 문자열 -> throw 없이 폴백', () => {
    const out = formatMessageTime(ISO, 'Not/AReal_Zone');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('잘못된 날짜 문자열 -> throw 없이 빈문자열', () => {
    expect(formatMessageTime('garbage', 'Asia/Seoul')).toBe('');
  });

  it('hour:minute 형식(시:분) 포함', () => {
    const out = formatMessageTime(ISO, 'Asia/Seoul');
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});
