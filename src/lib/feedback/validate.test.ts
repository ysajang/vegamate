import { describe, it, expect } from 'vitest';
import { validateFeedbackInput, FEEDBACK_CATEGORIES } from './validate';

describe('validateFeedbackInput', () => {
  it('accepts a valid payload and returns sanitized values', () => {
    const r = validateFeedbackInput({
      category: 'bug',
      message: '  selfie never arrived \u0000after she promised it  ',
      context: { path: '/chat/miku' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category).toBe('bug');
      // trimmed + control chars stripped
      expect(r.value.message).toBe('selfie never arrived after she promised it');
      expect(r.value.context).toEqual({ path: '/chat/miku' });
    }
  });

  it('rejects non-object bodies', () => {
    expect(validateFeedbackInput(null).ok).toBe(false);
    expect(validateFeedbackInput('hi').ok).toBe(false);
  });

  it('rejects unknown categories', () => {
    const r = validateFeedbackInput({ category: 'spam', message: 'x'.repeat(10) });
    expect(r.ok).toBe(false);
  });

  it('rejects empty / whitespace-only messages', () => {
    expect(validateFeedbackInput({ category: 'general', message: '   ' }).ok).toBe(false);
  });

  it('rejects messages over 5000 chars', () => {
    const r = validateFeedbackInput({ category: 'general', message: 'a'.repeat(5001) });
    expect(r.ok).toBe(false);
  });

  it('context is optional and non-object context is dropped, not fatal', () => {
    const r = validateFeedbackInput({ category: 'other', message: 'love the app' , context: 'weird'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.context).toBe(null);
  });

  it('exports the category list the DB check constraint mirrors', () => {
    expect(FEEDBACK_CATEGORIES).toEqual(['general', 'payment', 'bug', 'other']);
  });
});
