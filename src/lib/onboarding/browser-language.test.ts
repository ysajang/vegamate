import { describe, it, expect } from 'vitest';
import { detectPreferredLanguage } from './browser-language';

describe('detectPreferredLanguage', () => {
  it('maps region-tagged BCP-47 values to the primary code', () => {
    expect(detectPreferredLanguage('ko-KR')).toBe('ko');
    expect(detectPreferredLanguage('en-US')).toBe('en');
    expect(detectPreferredLanguage('fr-CA')).toBe('fr');
    expect(detectPreferredLanguage('pt_BR')).toBe('pt');
    expect(detectPreferredLanguage('JA-jp')).toBe('ja');
  });

  it('accepts bare primary codes', () => {
    expect(detectPreferredLanguage('de')).toBe('de');
    expect(detectPreferredLanguage('vi')).toBe('vi');
  });

  it('defaults to en for unsupported, empty, or malformed values', () => {
    expect(detectPreferredLanguage('sw')).toBe('en');
    expect(detectPreferredLanguage('')).toBe('en');
    expect(detectPreferredLanguage(null)).toBe('en');
    expect(detectPreferredLanguage(undefined)).toBe('en');
  });
});
