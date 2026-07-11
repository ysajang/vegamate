/**
 * Selfie promise ↔ delivery consistency (P0 — broken-promise fix).
 *
 * Prod evidence (meta ads round 1, conversation dfff84a9): Miku wrote
 * "I could send you a selfie from the dressing room later if you want?",
 * the user said "Sure", no [SELFIE:scene] marker was emitted, no photo was
 * sent, the user churned within a minute. Same structural failure as the
 * gift marker/body mismatch (sections 29–30): the model SAYS a thing without
 * emitting the marker that makes it happen. As there, the fix is a
 * deterministic pure-function correction layered on top of a prompt rule —
 * never trust the model's marker discipline for a P0 value moment.
 *
 * Rules implemented here (all pure, TDD):
 *   1. Reply text promises/offers a selfie but has NO marker → assign one,
 *      picking a scene that matches the text (pick_selfie_by_scene handles
 *      exact → fuzzy → fallback downstream; null scene is valid).
 *   2. Marker present → keep it (no double intervention).
 *   3. Crisis turns never send photos (safety wins).
 *   4. Refusal/negation wording ("can't send", "not sending", "못 보내")
 *      never triggers — declining a selfie request must stay a decline.
 *   5. An EXPLICIT promise beats the frequency guard: if the guard blocked
 *      this turn but the model visibly promised anyway, we honor the promise
 *      (a silently-swallowed promise reproduces the exact churn bug).
 */

/** Requests 1..N this many per session are honored past the guard; beyond it
 *  the frequency guard resumes (no infinite selfies — the AI deflects
 *  in character instead: "아까 보냈잖아 ㅋㅋ"). */
export const USER_REQUEST_SESSION_CAP = 3;

export interface SelfieDecisionInput {
  /** Visible reply text with any [SELFIE] marker already stripped. */
  cleanContent: string;
  /** Whether the AI emitted a [SELFIE] marker. */
  hasMarker: boolean;
  /** Scene from the marker (null for plain [SELFIE] or no marker). */
  markerScene: string | null;
  /** Frequency-guard verdict for this turn (anti-spam). */
  selfieAllowed: boolean;
  /** Crisis turns never send photos. */
  isCrisis: boolean;
  /** Scene tokens that actually have images for this character. */
  availableScenes: string[];
  /** The USER explicitly asked for a selfie this turn (detectUserSelfieRequest). */
  userRequestedSelfie?: boolean;
  /** How many user selfie requests this session INCLUDING this one. */
  selfieRequestCount?: number;
}

export interface SelfieDecision {
  sendSelfie: boolean;
  scene: string | null;
}

/** Photo nouns in both languages the app actually serves today. */
const PHOTO_NOUN = String.raw`(?:selfie|photos?|pics?|pictures?|셀카|사진|셀피)`;

/**
 * Positive promise/offer patterns, evaluated PER SENTENCE so a negation in a
 * neighboring sentence ("don't tell anyone. I'll send you a selfie") can't
 * mask a real promise.
 */
const PROMISE_PATTERNS: RegExp[] = [
  // "I'll/could/can/gonna/let me + send|take|snap|shoot|drop ... selfie/pic"
  new RegExp(
    String.raw`\b(?:i(?:'ll| will| can| could| might| wanna| want to|'m gonna| am gonna)?|let me|lemme|gonna)\b[^.!?\n]{0,40}\b(?:send|sending|take|taking|snap|shoot|drop)\b[^.!?\n]{0,40}\b${PHOTO_NOUN}`,
    'i'
  ),
  // "here's a selfie/pic" — present-tense delivery wording
  new RegExp(String.raw`\bhere(?:'s| is)\b[^.!?\n]{0,30}\b${PHOTO_NOUN}`, 'i'),
  // Korean: "셀카/사진 ... 보내줄게/보내줄까/보여줄게/찍어(서)"
  new RegExp(String.raw`(?:셀카|사진|셀피)[^.!?\n]{0,25}(?:보내|보여|찍)`),
  // Korean verb-first: "보내줄게 ... 셀카/사진"
  new RegExp(String.raw`(?:보내|보여|찍)[^.!?\n]{0,25}(?:셀카|사진|셀피)`),
  // Korean NOUN-LESS promises (prod 2026-07-11 miss: "몰래 찍은 거야 너한테만
  // 보내는 거니까" / "잠깐만, 찍을게" — no 셀카/사진 noun in the sentence):
  /(?:보여\s*줄게|보내\s*줄게|보내는\s*거|찍어\s*줄게|찍을게|찍어서\s*보내)/,
  new RegExp(String.raw`잠깐만[^.!?\n]{0,20}(?:셀카|사진|찍)`),
];

/**
 * USER-side explicit selfie request (the robust P0-b signal — AI-promise
 * wording mutates endlessly; the user's ask doesn't). Minimal ko/en set per
 * the directive; no typo normalization ("셀까") by design.
 */
const USER_REQUEST_NOUN = /(셀카|셀피|사진|selfie|photo|pic(?:ture)?s?)/i;
const USER_REQUEST_VERB = /(보여|보내|줘|주라|달라|send|show|see)/i;

export function detectUserSelfieRequest(text: string): boolean {
  if (!text) return false;
  const sentences = text.split(/[.!?\n]+/);
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (USER_REQUEST_NOUN.test(sentence) && USER_REQUEST_VERB.test(sentence)) return true;
  }
  return false;
}

/** Negation/refusal wording that disarms a match within the same sentence. */
const NEGATION_PATTERNS: RegExp[] = [
  new RegExp(
    String.raw`\b(?:can't|cannot|can not|won't|will not|wouldn't|couldn't|shouldn't|not|never|no)\b[^.!?\n]{0,30}\b(?:send|sending|take|snap|share|${PHOTO_NOUN})`,
    'i'
  ),
  /(?:못|안|않)[\s\S]{0,6}(?:보내|보여|찍)/,
  /(?:셀카|사진|셀피)[^.!?\n]{0,10}(?:은|는)?\s*(?:안|못)/,
];

/**
 * Does this reply text visibly promise/offer to send a photo?
 * Deferred promises ("I'll send one later") COUNT — the prompt bans deferral,
 * and if one slips through, fulfilling now beats breaking the promise.
 */
export function detectSelfiePromise(text: string): boolean {
  if (!text) return false;
  const sentences = text.split(/[.!?\n]+/);
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const promised = PROMISE_PATTERNS.some((re) => re.test(s));
    if (!promised) continue;
    const negated = NEGATION_PATTERNS.some((re) => re.test(s));
    if (!negated) return true;
  }
  return false;
}

/**
 * Pick the available scene that best matches the reply text (e.g. text says
 * "from the dressing room" and 'dressing_room' exists). Scoring: number of
 * scene words (len ≥ 3) found in the text; ties go to the more specific
 * (more-words-matched, then longer) scene. Null when nothing matches — the
 * plain [SELFIE] path (pick_selfie_by_scene fallback) handles that.
 */
export function matchSceneFromText(
  text: string,
  availableScenes: string[]
): string | null {
  if (!text || !availableScenes || availableScenes.length === 0) return null;
  const lower = text.toLowerCase();

  let best: string | null = null;
  let bestScore = 0;

  for (const scene of availableScenes) {
    const words = scene.toLowerCase().split(/[_\-\s]+/).filter((w) => w.length >= 3);
    if (words.length === 0) continue;
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits === 0) continue;
    // Require every word of a multi-word scene? No — partial hits are useful
    // ("morning" matches bed_morning), but a full match should outrank partial.
    const score = hits * 10 + (hits === words.length ? 5 : 0) + words.length;
    if (score > bestScore) {
      bestScore = score;
      best = scene;
    }
  }
  return best;
}

/**
 * Final send-or-not decision for this turn. Pure; the route/service applies it.
 */
export function resolveSelfieDecision(input: SelfieDecisionInput): SelfieDecision {
  const {
    cleanContent,
    hasMarker,
    markerScene,
    selfieAllowed,
    isCrisis,
    availableScenes,
    userRequestedSelfie = false,
    selfieRequestCount = 0,
  } = input;

  // Safety first: crisis turns never carry photos, whatever the model said.
  if (isCrisis) return { sendSelfie: false, scene: null };

  const promised = detectSelfiePromise(cleanContent);
  // User's explicit ask beats the frequency guard — but only up to the
  // session cap; the 4th+ request falls back to the guard (anti-farm).
  const userForce =
    userRequestedSelfie && selfieRequestCount <= USER_REQUEST_SESSION_CAP;

  if (hasMarker) {
    // Guard-permitted marker, a visible promise the user already read, or an
    // explicit user ask — all must deliver. A stray marker with none of those
    // while the guard blocked the turn is safely stripped.
    if (selfieAllowed || promised || userForce) {
      return { sendSelfie: true, scene: markerScene };
    }
    return { sendSelfie: false, scene: null };
  }

  // No marker: deterministic correction — a visible promise OR an explicit
  // user ask must be honored (prod 2026-07-11: the AI's noun-less Korean
  // promise slipped every text pattern; the user's ask is the robust signal).
  if (promised || userForce) {
    return { sendSelfie: true, scene: matchSceneFromText(cleanContent, availableScenes) };
  }

  return { sendSelfie: false, scene: null };
}
