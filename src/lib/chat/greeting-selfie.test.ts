import { describe, it, expect } from 'vitest';
import { planGreetingSelfie } from './greeting-selfie';

const BASE = {
  isNewConversation: true,
  selfieCollectionCount: 0,
  selfie: { id: 'selfie-1', rarity: 'common' },
  userId: 'user-1',
  characterId: 'char-miku',
};

describe('planGreetingSelfie', () => {
  it('attaches a selfie for a brand-new user first conversation', () => {
    const plan = planGreetingSelfie(BASE);
    expect(plan).toEqual({
      selfieId: 'selfie-1',
      rarity: 'common',
      contentType: 'text_with_selfie',
      collectionUpsert: {
        user_id: 'user-1',
        selfie_id: 'selfie-1',
        character_id: 'char-miku',
        rarity: 'common',
      },
    });
  });

  it('never attaches on conversation reactivation', () => {
    expect(planGreetingSelfie({ ...BASE, isNewConversation: false })).toBeNull();
  });

  it('never grants a second freebie — any owned selfie blocks it', () => {
    expect(planGreetingSelfie({ ...BASE, selfieCollectionCount: 1 })).toBeNull();
    expect(planGreetingSelfie({ ...BASE, selfieCollectionCount: 7 })).toBeNull();
  });

  it('degrades to a plain text greeting when the pool yields nothing', () => {
    expect(planGreetingSelfie({ ...BASE, selfie: null })).toBeNull();
  });
});
