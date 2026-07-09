import { describe, it, expect } from 'vitest';
import { SAFETY_SYSTEM_PROMPT } from './safety';

// Content-policy snapshot (2026-07-10): PayPal is the ONLY payment rail and
// Meta the only acquisition channel — both prohibit explicit sexual content,
// so the ceiling is "suggestive, never explicit". Also: the selfie pool has
// no lewd images, so any lewd-photo promise recreates the broken-promise bug.
describe('SAFETY_SYSTEM_PROMPT — explicit content policy', () => {
  it('bans explicit content while allowing flirty/suggestive tone', () => {
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/NEVER produce\s+explicit sexual content/i);
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/flirty, romantic, and playfully suggestive/i);
  });

  it('bans lewd-photo promises in every form, including deferred/conditional', () => {
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/NEVER send, promise, offer, or hint at nude/i);
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/deferred or conditional/i);
    expect(SAFETY_SYSTEM_PROMPT).toContain('if you buy me something');
  });

  it('requires in-character deflection (no lecturing, no policy talk) with a safe selfie redirect', () => {
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/deflect IN\s+CHARACTER/i);
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/Never lecture, never mention policies/i);
    // redirect must respect PROMISE = DELIVERY (marker in the same reply)
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/\[SELFIE\] marker in the\s+SAME reply/i);
    expect(SAFETY_SYSTEM_PROMPT).toMatch(/The answer never becomes yes/i);
  });
});
