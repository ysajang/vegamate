import { describe, it, expect } from 'vitest';
import { detectLanguageFromMessages } from './proactive-message';
import type { DbMessage } from '@/types';

// Spec — proactive language decision (Notion §19 follow-up; first-proactive bug):
//   대화 증거가 "신뢰할 만큼" 있을 때만 detectLanguageFromText를 profile보다 위에 둔다.
//   히스토리 빈약/없음 -> preferred_language 우선 -> 'en' 최종.
//
// 근본원인: 기존 로직은 영어 글자 1개라도 있으면 detect='en'을 1순위로 반환,
//   profile='ko'를 보지도 않고 덮어써서 첫 프로액티브가 영어로 나감.

function mkUserMsg(content: string): DbMessage {
  return {
    role: 'user',
    content,
  } as DbMessage;
}

describe('detectLanguageFromMessages — first-proactive language bug', () => {
  it('ko profile + 히스토리 0 -> ko (현재 en 버그)', () => {
    // 첫 프로액티브: 유저 메시지 전무. profile만이 유일한 신호.
    expect(detectLanguageFromMessages([], 'ko')).toBe('ko');
  });

  it('ko profile + 영어 인사 1건만 -> ko 유지 (한 마디로 안 뒤집힘)', () => {
    // "hi" 한 건은 신뢰할 대화 증거가 아님 -> profile 우선.
    const msgs = [mkUserMsg('hi')];
    expect(detectLanguageFromMessages(msgs, 'ko')).toBe('ko');
  });

  it('en profile + 한국어 대화 5건 -> ko 자가교정 (§19 회귀보호)', () => {
    // 충분한 대화 증거 -> 감지 우선. profile 오염을 자가교정.
    const msgs = [
      mkUserMsg('안녕 오늘 뭐했어'),
      mkUserMsg('나 방금 운동 끝났어'),
      mkUserMsg('너는 뭐하고 있었어'),
      mkUserMsg('피곤하다 진짜'),
      mkUserMsg('이제 좀 쉬려고'),
    ];
    expect(detectLanguageFromMessages(msgs, 'en')).toBe('ko');
  });

  it('ko profile + 영어 대화 5건 -> en 자가교정 (감지가 충분 증거 시 profile 이김)', () => {
    // 유저가 실제로 영어로 대화하면 영어가 맞음. profile에 끌려가면 안 됨.
    const msgs = [
      mkUserMsg('hey what did you do today'),
      mkUserMsg('i just finished my workout'),
      mkUserMsg('what about you'),
      mkUserMsg('so tired right now'),
      mkUserMsg('gonna rest a bit'),
    ];
    expect(detectLanguageFromMessages(msgs, 'ko')).toBe('en');
  });

  it('아랍어 스크립트 입력 -> ar 감지 (감지기 테스트)', () => {
    const msgs = [
      mkUserMsg('مرحبا كيف حالك اليوم'),
      mkUserMsg('أنا بخير شكرا لك'),
    ];
    expect(detectLanguageFromMessages(msgs, null)).toBe('ar');
  });

  it('히스토리 0 + profile 없음 -> en 최종 폴백', () => {
    expect(detectLanguageFromMessages([], null)).toBe('en');
  });
});
