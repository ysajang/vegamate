import { describe, it, expect } from 'vitest';
import {
  parseDirectCharSlug,
  captureDirectCharFromSearch,
  getStoredDirectChar,
  resolveDirectCharacter,
  DIRECT_CHAR_STORAGE_KEY,
} from './direct-entry';
import type { UtmStorage } from '@/lib/analytics/funnel';

function memoryStorage(initial: Record<string, string> = {}): UtmStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

const CHARS = [
  { slug: 'aria', id: 'a' },
  { slug: 'miku', id: 'm' },
  { slug: 'leo', id: 'l' },
  { slug: 'ren', id: 'r' },
];

describe('parseDirectCharSlug', () => {
  it('extracts and normalizes a valid slug', () => {
    expect(parseDirectCharSlug('?c=leo&utm_source=meta_ads')).toBe('leo');
    expect(parseDirectCharSlug('?c=MIKU')).toBe('miku');
  });

  it('rejects missing, malformed, or oversized values', () => {
    expect(parseDirectCharSlug('?utm_source=x')).toBeNull();
    expect(parseDirectCharSlug('?c=')).toBeNull();
    expect(parseDirectCharSlug('?c=<script>')).toBeNull();
    expect(parseDirectCharSlug(`?c=${'a'.repeat(40)}`)).toBeNull();
  });
});

describe('capture / read stored direct char', () => {
  it('stores on first touch and never overwrites', () => {
    const storage = memoryStorage();
    captureDirectCharFromSearch('?c=leo', storage);
    captureDirectCharFromSearch('?c=ren', storage);
    expect(getStoredDirectChar(storage)).toBe('leo');
  });

  it('ignores invalid stored values and missing storage', () => {
    const storage = memoryStorage({ [DIRECT_CHAR_STORAGE_KEY]: '<bad>' });
    expect(getStoredDirectChar(storage)).toBeNull();
    expect(() => captureDirectCharFromSearch('?c=leo', null)).not.toThrow();
    expect(getStoredDirectChar(null)).toBeNull();
  });
});

describe('resolveDirectCharacter', () => {
  it('routes to the ad character when stored slug matches', () => {
    expect(resolveDirectCharacter('leo', CHARS)?.slug).toBe('leo');
  });

  it('falls back to miku when slug is absent or unknown', () => {
    expect(resolveDirectCharacter(null, CHARS)?.slug).toBe('miku');
    expect(resolveDirectCharacter('ghost', CHARS)?.slug).toBe('miku');
  });

  it('falls back to the first character when miku is unavailable', () => {
    const noMiku = CHARS.filter((c) => c.slug !== 'miku');
    expect(resolveDirectCharacter(null, noMiku)?.slug).toBe('aria');
  });

  it('returns null on an empty roster (caller shows the picker)', () => {
    expect(resolveDirectCharacter('miku', [])).toBeNull();
  });
});
