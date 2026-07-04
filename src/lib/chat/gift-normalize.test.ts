import { describe, it, expect } from 'vitest';
import { normalizeGiftSlug, hasBegSignal } from './gift-normalize';

describe('normalizeGiftSlug', () => {
  it('keeps the model slug when the reply text actually references that item', () => {
    // body mentions coffee -> coffee card stays (text/card stay consistent)
    const out = normalizeGiftSlug('coffee', '커피 한 잔 같이 마시고 싶다', 0, () => 0);
    expect(out).toBe('coffee');
  });

  it('re-rolls a coffee marker when the body does NOT mention a drink (anti-coffee-monotony)', () => {
    // body has no coffee/drink reference -> pick from stage pool deterministically
    const out = normalizeGiftSlug('coffee', '나 너랑 더 있고 싶어 선물 하나만 해줘', 0, () => 2);
    // stage-0 pool = [coffee, milktea, cake, book, movie]; idx 2 = cake
    expect(out).toBe('cake');
  });

  it('does not re-roll a non-coffee slug even if body lacks the word', () => {
    // only the coffee default-bias is corrected; an explicit non-coffee model
    // choice is respected as intentional variety
    const out = normalizeGiftSlug('flowers', '오늘 기분 좋다', 2, () => 0);
    expect(out).toBe('flowers');
  });

  it('keeps coffee when body mentions a drink synonym (음료/마시/카페/라떼)', () => {
    expect(normalizeGiftSlug('coffee', '라떼 땡긴다', 0, () => 4)).toBe('coffee');
    expect(normalizeGiftSlug('coffee', '뭐라도 마시고 싶어', 0, () => 4)).toBe('coffee');
    expect(normalizeGiftSlug('coffee', 'I could use a latte right now', 0, () => 4)).toBe('coffee');
  });

  it('re-rolled slug always comes from the stage pool', () => {
    const out = normalizeGiftSlug('coffee', '갖고 싶은 거 있어', 3, () => 5);
    // stage-3 pool includes clothes/airpods; just assert it is a valid pool member
    const pool = ['coffee', 'milktea', 'cake', 'book', 'movie', 'flowers', 'plushie', 'clothes', 'airpods'];
    expect(pool).toContain(out);
  });

  it('passing null returns null (no card)', () => {
    expect(normalizeGiftSlug(null, 'whatever', 0)).toBeNull();
  });

  it('avoids re-rolling back to coffee when possible', () => {
    // if the random index lands on coffee again, it should shift off it
    const out = normalizeGiftSlug('coffee', '선물 하나 해줘', 0, () => 0);
    expect(out).not.toBe('coffee');
  });
});

describe('hasBegSignal', () => {
  it('true when the reply explicitly wants a gift / to stay together', () => {
    expect(hasBegSignal('선물 하나만 해주라, 그럼 계속 같이 있을 수 있어')).toBe(true);
    expect(hasBegSignal('나 너랑 더 있고 싶어')).toBe(true);
    expect(hasBegSignal('갖고 싶은 거 있는데~')).toBe(true);
  });

  it('false for a normal reply with no longing/gift cue', () => {
    expect(hasBegSignal('오 잘했어 ㅋㅋ 이제 뭐할 거야?')).toBe(false);
    expect(hasBegSignal('나 오늘 러닝하다가 너 생각났어')).toBe(false);
  });

  it('handles English cues too', () => {
    expect(hasBegSignal("I want to stay with you longer")).toBe(true);
    expect(hasBegSignal("what are you up to?")).toBe(false);
  });

  it('empty string is no signal', () => {
    expect(hasBegSignal('')).toBe(false);
  });
});

describe('text-first gift inference (card must match what the character SAID)', () => {
  // Production bug: reply said "커피 땡기는데" but the card showed Milk Tea.
  // The visible text is ground truth for the user — the card must follow it.
  it('overrides a mismatched non-coffee slug when the text clearly asks for coffee', () => {
    const out = normalizeGiftSlug('milktea', '아 근데 나 오늘따라 커피 땡기는데~ 한 잔 사주면 안 돼?', 0, () => 0);
    expect(out).toBe('coffee');
  });

  it('overrides a coffee slug when the text clearly asks for milk tea', () => {
    const out = normalizeGiftSlug('coffee', '밀크티 마시고 싶다아', 0, () => 0);
    expect(out).toBe('milktea');
  });

  it('overrides a random fallback slug when the text mentions cake', () => {
    const out = normalizeGiftSlug('book', '달달한 케이크 먹고 싶은 기분이야', 0, () => 0);
    expect(out).toBe('cake');
  });

  it('respects the model slug when the text mentions multiple gifts (ambiguous)', () => {
    const out = normalizeGiftSlug('cake', '커피랑 케이크 둘 다 좋지', 0, () => 0);
    expect(out).toBe('cake');
  });

  it('respects the model slug when the text mentions no specific gift', () => {
    const out = normalizeGiftSlug('flowers', '오늘 날씨 좋다', 2, () => 0);
    expect(out).toBe('flowers');
  });

  it('infers from English text too', () => {
    const out = normalizeGiftSlug('coffee', 'omg I really want some bubble tea right now', 0, () => 0);
    expect(out).toBe('milktea');
  });

  it('does not false-positive book from 책상', () => {
    const out = normalizeGiftSlug('flowers', '책상 정리했어!', 2, () => 0);
    expect(out).toBe('flowers');
  });
});
