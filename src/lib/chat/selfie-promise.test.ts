import { describe, it, expect } from 'vitest';
import {
  detectSelfiePromise,
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
