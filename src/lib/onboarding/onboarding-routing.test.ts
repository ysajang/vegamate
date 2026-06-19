import { describe, it, expect } from 'vitest';
import {
  isOnboardingComplete,
  resolveInitialOnboardingStep,
  stepToIndex,
  recoverStepOnAgeBlocked,
  isAgeNotVerified,
} from './onboarding-routing';

// P0 infinite-loop regression suite.
//
// Real prod data (Sana Regina, VALERIA ITZEL): display_name SET,
// birth_date NULL, age_verified_adult=false, total_messages_sent=0.
// That "zombie" state must route to the AGE step — not /select (bounces off
// the server guard) and not the NAME step (the visible ¿Cómo debo llamarte?
// loop).

describe('isOnboardingComplete (gate = name AND server age check)', () => {
  it('complete only when name AND age_verified_adult are both satisfied', () => {
    expect(
      isOnboardingComplete({ display_name: 'Sana', age_verified_adult: true })
    ).toBe(true);
  });

  it('NOT complete for the zombie state: name set but age unverified', () => {
    // This is the exact prod state that caused the loop.
    expect(
      isOnboardingComplete({ display_name: 'Sana', age_verified_adult: false })
    ).toBe(false);
  });

  it('NOT complete when age unverified is null (DOB step never reached)', () => {
    expect(
      isOnboardingComplete({ display_name: 'VALERIA', age_verified_adult: null })
    ).toBe(false);
  });

  it('NOT complete when there is no name even if (somehow) age-verified', () => {
    expect(
      isOnboardingComplete({ display_name: null, age_verified_adult: true })
    ).toBe(false);
  });

  it('treats whitespace-only name as no name', () => {
    expect(
      isOnboardingComplete({ display_name: '   ', age_verified_adult: true })
    ).toBe(false);
  });
});

describe('resolveInitialOnboardingStep (where a user lands on /onboarding)', () => {
  it('returns null (=> go to /select) when fully complete', () => {
    expect(
      resolveInitialOnboardingStep({ display_name: 'Sana', age_verified_adult: true })
    ).toBeNull();
  });

  it('ZOMBIE RECOVERY: name set, unverified -> AGE step (NOT name step)', () => {
    // The crux of the loop fix. Must be 'age', never 'name'.
    expect(
      resolveInitialOnboardingStep({ display_name: 'Sana', age_verified_adult: false })
    ).toBe('age');
    expect(
      resolveInitialOnboardingStep({ display_name: 'VALERIA', age_verified_adult: null })
    ).toBe('age');
  });

  it('fresh user (no name) -> NAME step', () => {
    expect(
      resolveInitialOnboardingStep({ display_name: null, age_verified_adult: null })
    ).toBe('name');
    expect(
      resolveInitialOnboardingStep({ display_name: '', age_verified_adult: false })
    ).toBe('name');
  });
});

describe('stepToIndex (UI step ordering: name->age->character->first-message)', () => {
  it('maps the age step to index 1 (the second step, after name)', () => {
    expect(stepToIndex('age')).toBe(1);
  });
  it('maps name/character/first-message to 0/2/3', () => {
    expect(stepToIndex('name')).toBe(0);
    expect(stepToIndex('character')).toBe(2);
    expect(stepToIndex('first-message')).toBe(3);
  });
});

describe('recoverStepOnAgeBlocked (403 at final step must not freeze or loop)', () => {
  it('recovers at the AGE step, not the name step', () => {
    expect(recoverStepOnAgeBlocked()).toBe('age');
  });
});

describe('isAgeNotVerified (detect the server age-gate rejection)', () => {
  it('true for the 403 AGE_NOT_VERIFIED payload', () => {
    expect(isAgeNotVerified({ success: false, code: 'AGE_NOT_VERIFIED' })).toBe(true);
  });
  it('false for unrelated failures', () => {
    expect(isAgeNotVerified({ success: false, code: 'SOMETHING_ELSE' })).toBe(false);
    expect(isAgeNotVerified({ success: true })).toBe(false);
    expect(isAgeNotVerified({})).toBe(false);
  });
});
