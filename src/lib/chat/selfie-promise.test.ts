import { describe, it, expect } from 'vitest';
import {
  detectSelfiePromise,
  detectUserSelfieRequest,
  matchSceneFromText,
  resolveSelfieDecision,
} from './selfie-promise';

const SCENES = ['cafe', 'morning_cafe', 'bed_morning', 'gym', 'beach_day', 'dressing_room'];

describe('detectSelfiePromise', () => {
  it('detects the exact prod promise ("I could send you a selfie ... if you want?")', () => {
    expect(
      detectSelfiePromise('I could send you a selfie from the dressing room later if you want?')
    ).toBe(true);
  });

  it('detects direct and deferred promise forms', () => {
    expect(detectSelfiePromise("ok ok I'll send you a pic")).toBe(true);
    expect(detectSelfiePromise("let me take a selfie for you real quick")).toBe(true);
    expect(detectSelfiePromise("I'll send you a photo later, promise")).toBe(true); // deferred → fulfil NOW
    expect(detectSelfiePromise("here's a selfie from practice")).toBe(true);
  });

  it('detects Korean promise forms', () => {
    expect(detectSelfiePromise('알겠어 셀카 보내줄게 ㅋㅋ')).toBe(true);
    expect(detectSelfiePromise('대기실에서 사진 찍어서 보여줄게')).toBe(true);
  });

  it('does NOT fire on refusals / negations', () => {
    expect(detectSelfiePromise("sorry, I can't send a selfie right now")).toBe(false);
    expect(detectSelfiePromise("I'm not sending pics tonight lol")).toBe(false);
    expect(detectSelfiePromise('지금은 사진 못 보내 ㅠㅠ')).toBe(false);
    expect(detectSelfiePromise('셀카는 안 보낼래')).toBe(false);
  });

  it('does NOT fire on unrelated text or mere photo mentions', () => {
    expect(detectSelfiePromise('just got out of practice, my feet are screaming')).toBe(false);
    expect(detectSelfiePromise('that photo you posted was cute')).toBe(false);
  });

  it('a negation in ANOTHER sentence does not mask a real promise', () => {
    expect(
      detectSelfiePromise("don't tell anyone okay? I'll send you a selfie from the dressing room")
    ).toBe(true);
  });
});

describe('matchSceneFromText', () => {
  it('matches a scene whose words appear in the text', () => {
    expect(
      matchSceneFromText('I could send you a selfie from the dressing room?', SCENES)
    ).toBe('dressing_room');
    expect(matchSceneFromText('just got to the cafe, want a pic?', SCENES)).toBe('cafe');
  });

  it('returns null when nothing matches (plain [SELFIE] fallback path)', () => {
    expect(matchSceneFromText("I'll send you a selfie", SCENES)).toBe(null);
    expect(matchSceneFromText("I'll send you a selfie", [])).toBe(null);
  });
});

describe('resolveSelfieDecision — promise↔marker consistency (deterministic correction)', () => {
  const base = {
    selfieAllowed: true,
    isCrisis: false,
    availableScenes: SCENES,
  };

  it('promise WITHOUT marker → marker auto-assigned with contextual scene', () => {
    const d = resolveSelfieDecision({
      ...base,
      cleanContent: 'I could send you a selfie from the dressing room later if you want?',
      hasMarker: false,
      markerScene: null,
    });
    expect(d.sendSelfie).toBe(true);
    expect(d.scene).toBe('dressing_room');
  });

  it('promise WITH marker → marker kept as-is (no double intervention)', () => {
    const d = resolveSelfieDecision({
      ...base,
      cleanContent: "just got to the cafe! sending you a pic",
      hasMarker: true,
      markerScene: 'cafe',
    });
    expect(d.sendSelfie).toBe(true);
    expect(d.scene).toBe('cafe');
  });

  it('no promise, no marker → no intervention', () => {
    const d = resolveSelfieDecision({
      ...base,
      cleanContent: 'rehearsal ran late today, so tired',
      hasMarker: false,
      markerScene: null,
    });
    expect(d.sendSelfie).toBe(false);
  });

  it('crisis context → never fires, even on an explicit promise', () => {
    const d = resolveSelfieDecision({
      ...base,
      isCrisis: true,
      cleanContent: "I'll send you a selfie to cheer you up",
      hasMarker: false,
      markerScene: null,
    });
    expect(d.sendSelfie).toBe(false);
    expect(d.scene).toBe(null);
  });

  it('refusal context → never fires (user selfie request declined)', () => {
    const d = resolveSelfieDecision({
      ...base,
      cleanContent: "haha nice try, I'm not sending pics like that",
      hasMarker: false,
      markerScene: null,
    });
    expect(d.sendSelfie).toBe(false);
  });

  it('frequency guard blocked + explicit promise → promise WINS over the guard', () => {
    // If the guard silently blocked a promised selfie, the exact prod bug
    // (promise → no photo → churn) would reoccur through a different path.
    const d = resolveSelfieDecision({
      ...base,
      selfieAllowed: false,
      cleanContent: "I'll send you a selfie from the gym",
      hasMarker: false,
      markerScene: null,
    });
    expect(d.sendSelfie).toBe(true);
    expect(d.scene).toBe('gym');
  });

  it('guard blocked + stray marker but NO visible promise → marker stripped (guard holds)', () => {
    const d = resolveSelfieDecision({
      ...base,
      selfieAllowed: false,
      cleanContent: 'anyway how was your day?',
      hasMarker: true,
      markerScene: 'cafe',
    });
    expect(d.sendSelfie).toBe(false);
  });
});

describe('detectUserSelfieRequest — user-side explicit request (P0-b supplement)', () => {
  // Prod 2026-07-11 (ko user 191bf607): "너 셀카 보여줘" ×3 — AI promised in
  // noun-less Korean ("몰래 찍은 거야 너한테만 보내는 거니까") that the
  // noun-required promise patterns missed. The user's own request is the
  // robust signal; AI-promise detection stays as the secondary layer.
  it('fires on Korean explicit requests', () => {
    expect(detectUserSelfieRequest('너 셀카 보여줘')).toBe(true);
    expect(detectUserSelfieRequest('셀카 보여달라고')).toBe(true);
    expect(detectUserSelfieRequest('사진 하나만 보내줘')).toBe(true);
    expect(detectUserSelfieRequest('셀카 좀 주라')).toBe(true);
  });

  it('fires on English explicit requests (regression)', () => {
    expect(detectUserSelfieRequest('show me a selfie')).toBe(true);
    expect(detectUserSelfieRequest('send me a pic')).toBe(true);
    expect(detectUserSelfieRequest('can I see a photo of you')).toBe(true);
  });

  it('does NOT fire without a request verb or photo noun', () => {
    expect(detectUserSelfieRequest('그 사진 진짜 웃겼어')).toBe(false);
    expect(detectUserSelfieRequest('오늘 뭐해?')).toBe(false);
    expect(detectUserSelfieRequest('show me how you dance')).toBe(false);
  });
});

describe('AI promise detection — noun-less Korean promises (prod miss)', () => {
  it('fires on the exact prod lines that slipped through', () => {
    expect(detectSelfiePromise('대기실에서 몰래 찍은 거야 너한테만 보내는 거니까 비밀이야')).toBe(true);
    expect(detectSelfiePromise('ㅋㅋ 알겠어 잠깐만, 셀카 찍을게')).toBe(true);
    expect(detectSelfiePromise('알겠어 보여줄게')).toBe(true);
    expect(detectSelfiePromise('지금 찍어줄게 기다려')).toBe(true);
  });
});

describe('resolveSelfieDecision — user request forcing + session cap', () => {
  const base = {
    selfieAllowed: false, // frequency guard blocked — user request must win
    isCrisis: false,
    availableScenes: ['cafe', 'dressing_room'],
    cleanContent: 'ㅋㅋ 알겠어 잠깐만',
    hasMarker: false,
    markerScene: null,
  };

  it('explicit user request forces the marker while fewer than 3 selfies were DELIVERED', () => {
    for (const delivered of [0, 1, 2]) {
      const d = resolveSelfieDecision({ ...base, userRequestedSelfie: true, selfiesDelivered: delivered });
      expect(d.sendSelfie).toBe(true);
    }
  });

  it('PROD REGRESSION (2026-07-12): unfulfilled past ASKS must not count — 4th ask with 0 deliveries still sends', () => {
    // Pre-deploy asks were never fulfilled; counting asks made the AI deflect
    // with "아까 보냈잖아" while the user had received zero selfies.
    const d = resolveSelfieDecision({ ...base, userRequestedSelfie: true, selfiesDelivered: 0 });
    expect(d.sendSelfie).toBe(true);
  });

  it('3 selfies already delivered: guard resumes (no infinite selfies)', () => {
    const d = resolveSelfieDecision({ ...base, userRequestedSelfie: true, selfiesDelivered: 3 });
    expect(d.sendSelfie).toBe(false);
  });

  it('crisis still wins over an explicit request', () => {
    const d = resolveSelfieDecision({
      ...base,
      isCrisis: true,
      userRequestedSelfie: true,
      selfiesDelivered: 0,
    });
    expect(d.sendSelfie).toBe(false);
  });

  it('no user request + no promise + guard blocked → unchanged (no send)', () => {
    const d = resolveSelfieDecision({
      ...base,
      cleanContent: 'anyway how was your day?',
      userRequestedSelfie: false,
      selfiesDelivered: 0,
    });
    expect(d.sendSelfie).toBe(false);
  });
});
