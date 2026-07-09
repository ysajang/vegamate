import { describe, it, expect } from 'vitest';
import {
  resolveResponseLanguage,
  buildLanguageDirective,
  containsKoreanLeak,
} from './language-directive';
import type { DbMessage } from '@/types';

function msg(role: 'user' | 'assistant', content: string): DbMessage {
  return { role, content } as unknown as DbMessage;
}

describe('resolveResponseLanguage — section-19 priority (conversation → profile → en)', () => {
  it('resolves to en for an English-only conversation even when profile is ko', () => {
    // Actual usage wins over stored preference (detectLanguageFromMessages priority).
    const history = [msg('user', 'Hii'), msg('assistant', '안녕! ✨ 뭐 하고 있어?')];
    expect(resolveResponseLanguage(history, 'English please', 'ko')).toBe('en');
  });

  it('resolves to ko when the user actually writes Korean', () => {
    const history = [msg('user', '안녕 오늘 뭐했어?')];
    expect(resolveResponseLanguage(history, '보고 싶었어', 'en')).toBe('ko');
  });

  it('mid-conversation switch ko → en: the LATEST confident message wins over Korean history', () => {
    // Prod report (2026-07-09): master chatted in Korean, switched to English,
    // still got Korean — blob detection let old Hangul outvote the switch.
    const history = [
      msg('user', '안녕 오늘 뭐했어?'),
      msg('assistant', '리허설 했지 ㅋㅋ'),
      msg('user', '재밌었겠다'),
    ];
    expect(resolveResponseLanguage(history, "let's talk in English from now on", 'ko')).toBe('en');
  });

  it('mid-conversation switch en → ko works symmetrically', () => {
    const history = [msg('user', 'hey how was practice'), msg('user', 'nice')];
    expect(resolveResponseLanguage(history, '이제 한국어로 하자', 'en')).toBe('ko');
  });

  it('short/ambiguous latest message ("ok") inherits the most recent confident language', () => {
    // "ok" is too short to detect — the scan walks back to the English switch,
    // NOT all the way to a Korean blob.
    const history = [
      msg('user', '안녕 오늘 뭐했어?'),
      msg('user', 'switching to English now please'),
    ];
    expect(resolveResponseLanguage(history, 'ok', 'ko')).toBe('en');
  });

  it('ignores ASSISTANT Korean when judging the user language (AI leak must not self-reinforce)', () => {
    // The prod bug: Miku leaked Korean. That leak lives in assistant turns and
    // must never flip detection back to ko for an English user.
    const history = [
      msg('user', 'Hii'),
      msg('assistant', 'I love you too... 이거 아무한테도 말 안 한 거 알았지?'),
      msg('user', 'English please'),
    ];
    expect(resolveResponseLanguage(history, 'Sure', 'en')).toBe('en');
  });

  it('falls back to profile language when there is no usable message text', () => {
    expect(resolveResponseLanguage([], 'ㅎ', 'ja')).toBe('ja');
  });

  it('falls back to en when neither messages nor profile give a language', () => {
    expect(resolveResponseLanguage([], '', null)).toBe('en');
  });
});

describe('buildLanguageDirective', () => {
  it('for en: names the language, forbids Korean sentences AND Korean slang (ㅋㅋ/ㅎㅎ/ㅠㅠ)', () => {
    const d = buildLanguageDirective('en');
    expect(d).toContain('ONLY in English');
    expect(d).toMatch(/ㅋㅋ/);
    expect(d).toMatch(/ㅎㅎ/);
    expect(d).toMatch(/ㅠㅠ/);
    // Korean texting habits must be translated to target-language equivalents.
    expect(d.toLowerCase()).toContain('lol');
    // Persona Korean examples are style references to re-express, not to copy.
    expect(d.toLowerCase()).toContain('style');
  });

  it('for ko: instructs Korean and does NOT forbid Korean slang', () => {
    const d = buildLanguageDirective('ko');
    expect(d).toContain('ONLY in Korean');
    expect(d).not.toMatch(/Never mix Korean/i);
  });

  it('maps common codes to readable names and falls back to the raw code', () => {
    expect(buildLanguageDirective('ja')).toContain('ONLY in Japanese');
    expect(buildLanguageDirective('xx')).toContain('ONLY in "xx"');
  });

  it('with no resolved language: falls back to detect-latest-message behavior', () => {
    const d = buildLanguageDirective(null);
    expect(d).toMatch(/LATEST message/i);
  });
});

describe('containsKoreanLeak — assertion helper for en scenarios', () => {
  it('flags Hangul syllables and Korean slang jamo', () => {
    expect(containsKoreanLeak('이거 아무한테도 말 안 한 거 알았지?')).toBe(true);
    expect(containsKoreanLeak('my feet are literally screaming ㅋㅋ')).toBe(true);
    expect(containsKoreanLeak('so tired ㅠㅠ')).toBe(true);
  });

  it('passes clean English (with normal punctuation/emoji)', () => {
    expect(containsKoreanLeak("just got out of practice lol 💜 don't tell anyone ok?")).toBe(false);
  });
});
