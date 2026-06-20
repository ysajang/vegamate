import { describe, it, expect } from 'vitest';
import { pickGreeting } from './greeting';

// Spec — 캐릭터 첫 인사 언어 선택:
//   근본원인: conversation 생성 시 greeting_message(단일 영어)를 언어 결정 없이 삽입 →
//   profile='ko' 유저도 첫 인사가 영어. greeting_i18n[lang] 우선 → en → 원본 폴백.

describe('pickGreeting', () => {
  const i18n = {
    en: 'hey, missed you',
    ko: '안녕 보고 싶었어',
  };
  const fallback = 'hey, missed you'; // characters.greeting_message (en 원본)

  it('profile=ko + ko 키 존재 -> ko greeting (핵심 버그)', () => {
    expect(pickGreeting(i18n, 'ko', fallback)).toBe('안녕 보고 싶었어');
  });

  it('profile=en -> en greeting', () => {
    expect(pickGreeting(i18n, 'en', fallback)).toBe('hey, missed you');
  });

  it('profile=ja (미지원 언어) -> en 폴백 (깨지지 않음)', () => {
    expect(pickGreeting(i18n, 'ja', fallback)).toBe('hey, missed you');
  });

  it('profile=null -> en 폴백', () => {
    expect(pickGreeting(i18n, null, fallback)).toBe('hey, missed you');
  });

  it('greeting_i18n 비어있음({}) -> fallback(원본 greeting_message)', () => {
    expect(pickGreeting({}, 'ko', fallback)).toBe(fallback);
  });

  it('greeting_i18n null/undefined -> fallback (구 데이터 안전)', () => {
    expect(pickGreeting(null, 'ko', fallback)).toBe(fallback);
    expect(pickGreeting(undefined, 'ko', fallback)).toBe(fallback);
  });

  it('en 키도 없고 요청 언어도 없음 -> fallback', () => {
    expect(pickGreeting({ fr: 'salut' }, 'ko', fallback)).toBe(fallback);
  });

  it('빈 문자열 값은 무시하고 폴백 (빈 greeting 방지)', () => {
    expect(pickGreeting({ ko: '   ', en: 'hi' }, 'ko', fallback)).toBe('hi');
  });
});
