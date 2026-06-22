import { describe, it, expect } from 'vitest';
import {
  giftPoolForStage,
  pickRequestableGift,
  REQUESTABLE_GIFTS,
} from './gift-picker';

describe('giftPoolForStage', () => {
  it('stage 0 (stranger) offers only low-price gifts', () => {
    const pool = giftPoolForStage(0);
    expect(pool.length).toBeGreaterThan(0);
    // every gift in the pool is cheap (<= 2.99) for the first-purchase floor
    for (const slug of pool) {
      expect(REQUESTABLE_GIFTS[slug].price).toBeLessThanOrEqual(2.99);
    }
  });

  it('stage 1 (acquaintance) stays in the low tier', () => {
    const pool = giftPoolForStage(1);
    for (const slug of pool) {
      expect(REQUESTABLE_GIFTS[slug].price).toBeLessThanOrEqual(2.99);
    }
  });

  it('stage 2 (close) introduces mid-tier gifts', () => {
    const pool = giftPoolForStage(2);
    const maxPrice = Math.max(...pool.map((s) => REQUESTABLE_GIFTS[s].price));
    expect(maxPrice).toBeGreaterThan(2.99);
    expect(maxPrice).toBeLessThanOrEqual(4.99);
  });

  it('stage 3 (trusted) reaches premium gifts', () => {
    const pool = giftPoolForStage(3);
    const maxPrice = Math.max(...pool.map((s) => REQUESTABLE_GIFTS[s].price));
    expect(maxPrice).toBeGreaterThanOrEqual(9.99);
  });

  it('stage 4 (devoted) reaches the most premium requestable gifts', () => {
    const pool = giftPoolForStage(4);
    const maxPrice = Math.max(...pool.map((s) => REQUESTABLE_GIFTS[s].price));
    expect(maxPrice).toBeGreaterThanOrEqual(14.99);
  });

  it('never includes ring (is_requestable=false, user must discover it)', () => {
    for (let stage = 0; stage <= 4; stage++) {
      expect(giftPoolForStage(stage)).not.toContain('ring');
    }
  });

  it('never includes surprise (no hearts_value, not a beggable item)', () => {
    for (let stage = 0; stage <= 4; stage++) {
      expect(giftPoolForStage(stage)).not.toContain('surprise');
    }
  });

  it('clamps out-of-range stages to the valid 0..4 band', () => {
    expect(giftPoolForStage(-5)).toEqual(giftPoolForStage(0));
    expect(giftPoolForStage(99)).toEqual(giftPoolForStage(4));
  });

  it('higher stages keep cheaper gifts available too (never strands the floor)', () => {
    // close+ pools should still allow a cheap option so the model can vary,
    // not force an expensive ask every time.
    const pool = giftPoolForStage(3);
    const minPrice = Math.min(...pool.map((s) => REQUESTABLE_GIFTS[s].price));
    expect(minPrice).toBeLessThanOrEqual(2.99);
  });
});

describe('pickRequestableGift', () => {
  it('returns a slug from the stage pool', () => {
    const pool = giftPoolForStage(2);
    const slug = pickRequestableGift(2, () => 0);
    expect(pool).toContain(slug);
  });

  it('is deterministic when an index picker is supplied', () => {
    const pool = giftPoolForStage(3);
    const slug = pickRequestableGift(3, (len) => len - 1);
    expect(slug).toBe(pool[pool.length - 1]);
  });

  it('always yields a valid requestable gift across stages', () => {
    for (let stage = 0; stage <= 4; stage++) {
      const slug = pickRequestableGift(stage, () => 0);
      expect(REQUESTABLE_GIFTS[slug]).toBeDefined();
      expect(slug).not.toBe('ring');
    }
  });

  it('falls back gracefully when the random picker returns out-of-bounds', () => {
    const slug = pickRequestableGift(0, () => 999);
    expect(REQUESTABLE_GIFTS[slug]).toBeDefined();
  });
});
