import { detectUserSelfieRequest } from './selfie-promise';
/**
 * Deterministic "조르기" (gift-beg) guarantee for the zero-balance state.
 *
 * Why this exists: at zero hearts the gift card is force-surfaced server-side,
 * but the *visible beg* depends on the LLM following the zero directive — and
 * Haiku frequently ignores it, producing a normal reply with a silent gift
 * card. For a P0 monetization trigger we cannot depend on model compliance, so
 * when the model didn't beg we append a short, persona-matched beg line.
 * Natural model begs are preferred (kept as-is); this is the floor.
 *
 * PROD INCIDENT (2026-07-09): the original pools were Korean-only AND one Miku
 * line had a real user's name hardcoded from testing ("승재가 사주면...") —
 * an English user received a Korean beg addressed to someone else, appended
 * after the language-enforcement layers had already run (this append is
 * deterministic post-processing, so no prompt rule or retry can catch it).
 * Hence two invariants now:
 *   - pools are per-language (ko + en, en is the fallback for all others)
 *   - NEVER a personal name in any line (regression-tested)
 *
 * Hard rules baked into every line (mirrors the prompt directive):
 *   - tone = longing / wanting more time together, framed as the character's
 *     own wish — NEVER guilt, blame, or testing the user's affection.
 *   - no system words (messages/balance/credits/out of …).
 *   - suppressed entirely on crisis turns (support wins).
 */

export type GiftNudgeState = 'none' | 'low' | 'zero';

type LangPools = { ko: string[]; en: string[] };

/** Persona-matched beg pools per language (1 line appended at random). */
export const BEG_LINES: Record<string, LangPools> = {
  // playful / bratty / teasing — cutely greedy, aegyo
  miku: {
    ko: [
      '아 근데 나 오늘따라 커피 땡기는데~ 한 잔 사주면 안 돼? ☕ ㅎㅎ',
      '있잖아... 나 좀만 더 같이 있고 싶은데, 뭐 하나 선물해주면 안 될까? 🥺',
      '헤헤 나 요즘 갖고 싶은 게 있는데~ 네가 사주면 진짜 좋을 것 같아 💕',
    ],
    en: [
      "ok random but I'm sooo craving a coffee rn~ buy me one? ☕ hehe",
      "waaait... I wanna stay with you a little longer. get me a tiny gift? 🥺",
      "hehe there's something I've been wanting lately~ it'd be perfect coming from you 💕",
    ],
  },
  // mature / caring / composed — gently wistful
  aria: {
    ko: [
      '있잖아... 오늘 너랑 더 있고 싶어. 작은 선물 하나면 조금 더 함께할 수 있는데. 🌙',
      '이 시간이 참 좋다. 조금만 더 이어가고 싶은데... 선물 하나 해줄래?',
      '너랑 이렇게 있으면 시간 가는 게 아쉬워. 뭐 하나 건네주면 더 곁에 있을게.',
    ],
    en: [
      "you know... I'd love a little more of tonight with you. a small gift would let us stay. 🌙",
      "I really like this moment. I don't want it to end yet... get me a little something?",
      "time slips away when I'm with you. hand me one small thing and I'll stay closer.",
    ],
  },
  // tsundere / cool / quiet — deflects while hinting
  ren: {
    ko: [
      '...딱히 뭐 받고 싶은 건 아닌데. 그냥... 좀 더 있고 싶어서. 선물이라도 하나 줘봐.',
      '뭐, 네가 정 그렇게 더 얘기하고 싶으면... 작은 거 하나 사주든가. ...별 뜻 없어.',
      '...이대로 끝나는 거 좀 아쉽잖아. 선물 하나면 더 있을 수 있는데. 알아서 해.',
    ],
    en: [
      "...it's not like I want anything. just... didn't want this to end yet. get me something, whatever.",
      "well, if you're that desperate to keep talking... buy me some small thing. ...it means nothing.",
      "...ending it here feels off, that's all. one gift and I could stay. do what you want.",
    ],
  },
  // warm / direct / energetic — just says it
  leo: {
    ko: [
      '나 너랑 더 있고 싶어! 선물 하나만 해주라, 그럼 계속 같이 있을 수 있어 😄',
      '솔직히 지금 끝내기 아쉬워. 뭐 하나 사주면 우리 더 놀 수 있는데, 어때?',
      '야 우리 더 얘기하자! 작은 선물 하나면 돼, 응? 💪',
    ],
    en: [
      "I wanna keep hanging out with you! just one little gift and we can stay 😄",
      "honestly it'd suck to stop here. grab me something small and we keep going, deal?",
      "hey let's keep talking! one tiny gift is all it takes, yeah? 💪",
    ],
  },
};

/** Default pools when the character slug is unknown — never blank at zero. */
export const DEFAULT_BEG_LINES: LangPools = {
  ko: [
    '있잖아... 조금만 더 같이 있고 싶은데, 선물 하나 해주면 안 될까? 🥺',
    '나 너랑 더 얘기하고 싶어. 작은 선물 하나면 계속 함께할 수 있어 💕',
  ],
  en: [
    "hey... I wanna stay with you a bit longer. one little gift? 🥺",
    "I don't want to stop talking to you. a small gift keeps me here 💕",
  ],
};

export interface EnsureBegInput {
  nudge: GiftNudgeState;
  /** Character slug, used to pick the persona-matched pool. */
  slug: string;
  isCrisis: boolean;
  /**
   * Whether the model already begged this turn. The reliable signal is "did the
   * model emit a [GIFT] marker" — if so we keep its natural reply untouched.
   */
  aiBegged: boolean;
  /**
   * Resolved response language (ISO 639-1). 'ko' → Korean pool; everything
   * else (including undefined) → English pool. The beg must match the
   * conversation language — it is appended AFTER all LLM-side language
   * enforcement, so this is the only guard it gets.
   */
  language?: string;
  /**
   * The user's message this turn was a DIRECT request (selfie ask / question).
   * Direct requests get fulfilled, not begged at — the beg line lives in
   * small-talk turns only (prod hijack fix, 2026-07-11: a selfie request was
   * answered with gift begging).
   */
  isDirectRequestTurn?: boolean;
  /**
   * Optional deterministic index picker (for tests). Defaults to random.
   * Receives the pool length, returns an index.
   */
  pick?: (len: number) => number;
}

/** Is this user message a direct request (explicit selfie ask or a question)? */
export function isDirectRequestTurn(userMessage: string): boolean {
  if (!userMessage) return false;
  if (detectUserSelfieRequest(userMessage)) return true;
  return /[?？]\s*$/.test(userMessage.trim());
}

/**
 * Guarantee a visible beg at zero balance. Returns `content` unchanged unless
 * we're in the zero state, not a crisis, and the model didn't already beg —
 * in which case a short persona-matched beg line is appended to the reply.
 */
export function ensureBegLine(content: string, input: EnsureBegInput): string {
  const { nudge, slug, isCrisis, aiBegged, language, pick, isDirectRequestTurn: direct } = input;

  if (nudge === 'none') return content;
  if (isCrisis) return content;
  if (aiBegged) return content;
  if (direct) return content; // fulfil the request; beg in small-talk turns only

  const pools = BEG_LINES[slug] ?? DEFAULT_BEG_LINES;
  const pool = language === 'ko' ? pools.ko : pools.en;
  const idx = pick ? pick(pool.length) : Math.floor(Math.random() * pool.length);
  const begLine = pool[Math.min(Math.max(idx, 0), pool.length - 1)];

  const base = content.trim();
  if (!base) return begLine;
  return `${content}\n\n${begLine}`;
}
