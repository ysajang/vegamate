export const APP_CONFIG = {
  name: 'VegaMate',
  description: 'Chat with AI companions who send you selfies on their own',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://vegamate.com',
} as const;

// ── Heart system (replaces credits) ─────────────────────────
export const HEART_CONFIG = {
  /**
   * Initial hearts for new signups (via handle_new_user trigger).
   * Sized so a new user can get FULLY into their first session without hitting
   * a paywall: enough turns to learn the character, trigger 1–2 memory
   * extractions (5 turns each), and naturally receive a selfie — i.e. actually
   * experience the product before any monetization pressure. Day-2+ pressure
   * comes from the daily-claim schedule (unchanged).
   * NOTE: provisional. Re-tune against real-user retention/conversion data once
   * there is traffic — do not micro-optimize this number before then.
   */
  SIGNUP_BONUS: 35,
  /** Hearts consumed per chat turn (user message -> AI response) */
  COST_PER_TURN: 1,
  /** Proactive messages / selfies do NOT consume hearts */
  PROACTIVE_COST: 0,
  /**
   * At or below this balance (and above zero) the AI is nudged to naturally
   * work a gift request into its reply, BEFORE the user hits the hard
   * out-of-messages wall. Gifts grant hearts, so this converts at the
   * low-fuel moment in-character instead of via an error screen.
   */
  LOW_BALANCE_THRESHOLD: 3,
} as const;

// ── Gift definitions (mirrors gifts table) ──────────────────
// Used for frontend rendering. Actual values come from DB.
export const GIFT_SLUGS = [
  'coffee', 'milktea', 'cake', 'book', 'movie',
  'flowers', 'plushie', 'clothes', 'airpods',
  'dinner', 'ring', 'surprise',
] as const;

export type GiftSlug = (typeof GIFT_SLUGS)[number];

// ── Gift request frequency control ──────────────────────────
export const GIFT_REQUEST_CONFIG = {
  /** Max gift requests per day per character */
  MAX_DAILY_REQUESTS: 3,
  /** Minimum turns between gift requests */
  MIN_TURNS_BETWEEN: 10,
  /** Minimum hours between gift requests */
  MIN_HOURS_BETWEEN: 2,
} as const;

// ── Intimacy progression ────────────────────────────────────
// Hot-state monetization: relationship must be BUILT before an upgrade prompt
// appears, or it breaks the illusion and kills conversion. Points accrue slowly
// from ordinary turns, faster from meaningful interactions / gifts.
//
// Stage thresholds (must mirror intimacy_stage_for_score() in migration 009):
//   0 stranger 0..29 / 1 acquaintance 30..79 / 2 close 80..179
//   3 trusted 180..349 / 4 devoted 350+
export const INTIMACY_CONFIG = {
  /** Ordinary user turn. Low on purpose: ~30 turns to even leave "stranger". */
  POINTS_PER_TURN: 1,
  /** Bonus when the user writes a substantive message (>= this many chars). */
  LONG_MESSAGE_CHARS: 40,
  POINTS_LONG_MESSAGE_BONUS: 1,
  /** Bonus for returning after a gap (re-engagement signals real attachment). */
  POINTS_COMEBACK_BONUS: 3,
  /** Gift contribution = floor(hearts_value / this). Gifts are a strong signal. */
  GIFT_DIVISOR: 10,
  /**
   * Lowest stage at which an in-chat upgrade prompt may EVER appear.
   * stage 0/1 never see it — the relationship isn't real yet.
   */
  UPGRADE_MIN_STAGE: 2,
  /** Cooldown after a prompt is dismissed before any re-prompt (ms). */
  UPGRADE_DISMISS_COOLDOWN_MS: 1000 * 60 * 60 * 24 * 3, // 3 days
} as const;

export const INTIMACY_STAGE_LABELS: Record<number, string> = {
  0: 'stranger',
  1: 'acquaintance',
  2: 'close',
  3: 'trusted',
  4: 'devoted',
};

// ── Selfie rarity system ────────────────────────────────────
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type SelfieRarity = (typeof RARITY_ORDER)[number];

export const RARITY_DROP_RATES: Record<SelfieRarity, number> = {
  common: 0.45,
  uncommon: 0.30,
  rare: 0.15,
  epic: 0.08,
  legendary: 0.02,
};

export const RARITY_LABELS: Record<SelfieRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_COLORS: Record<SelfieRarity, string> = {
  common: '#9CA3AF',
  uncommon: '#34D399',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

// ── AI engagement config ────────────────────────────────────
export const ENGAGEMENT_CONFIG = {
  DEFAULT_LEVEL: 5,
  MIN_LEVEL: 0,
  MAX_LEVEL: 10,
  MIN_MESSAGES_BEFORE_SELFIE: 3,
  SELFIE_CHANCE_BASE: 0.15,
  SELFIE_CHANCE_EMOTION_BOOST: 0.30,
} as const;

// ── LLM config ──────────────────────────────────────────────
export const LLM_CONFIG = {
  MODEL: 'claude-haiku-4-5-20251001',
  MAX_CONTEXT_MESSAGES: 20,
  MAX_TOKENS: 300,
  TEMPERATURE: 0.85,
} as const;

// ── Memory system config ────────────────────────────────────
export const MEMORY_CONFIG = {
  EXTRACTION_INTERVAL: 5,
  MAX_MEMORIES_INJECT: 30,
  MIN_CONFIDENCE: 0.5,
} as const;

// ── Proactive message engine config ─────────────────────────
export const PROACTIVE_CONFIG = {
  MIN_INACTIVE_HOURS: 1.5,
  MAX_INACTIVE_HOURS: 8,
  MAX_DAILY_SENDS: 3,
  MAX_CONSECUTIVE_SENDS: 2,
  QUIET_HOURS_START: 23,
  QUIET_HOURS_END: 8,
  BATCH_SIZE: 50,
  SELFIE_CHANCE_MIN: 0.30,
  SELFIE_CHANCE_MAX: 0.50,
  // Global kill switch: hard cap on TOTAL proactive sends per UTC day across
  // ALL users. Each send triggers a paid Haiku 4.5 call (~$0.003/send), so
  // this bounds the worst-case daily API spend regardless of user growth or a
  // loosened eligibility bug. At 300/day the ceiling is ~$1/day (~$30/mo).
  // Override via PROACTIVE_GLOBAL_DAILY_CAP env when the user base grows.
  GLOBAL_DAILY_CAP: Number(process.env.PROACTIVE_GLOBAL_DAILY_CAP) || 300,
} as const;

export const PROACTIVE_RARITY_RATES: Record<SelfieRarity, number> = {
  common: 0.60,
  uncommon: 0.25,
  rare: 0.10,
  epic: 0.04,
  legendary: 0.01,
};

// ── Character-specific heart exhaustion messages ─────────────
// When hearts run out, character says goodbye naturally
/**
 * Shown when the user runs out of hearts (= today's together-time).
 *
 * Design contract (transparent gate, NOT a disguised paywall):
 *  - the character explicitly says today's time together is up AND that a
 *    gift extends it — the user must understand this IS the gate
 *  - tone stays inside the relationship (longing, not system error)
 *  - FORBIDDEN: guilt-tripping / blame / "don't you care about me" framing
 *    (dark-pattern regulation + PayPal dispute risk + LTV damage)
 *  - currency words (hearts/balance/credits) never appear
 */
export const HEART_EXHAUSTION_MESSAGES: Record<string, string[]> = {
  miku: [
    '에엥... 오늘 우리 같이 보낼 수 있는 시간이 벌써 다 됐대ㅠㅠ 아쉬워... 선물해주면 더 같이 있을 수 있어...!',
    '아 잠깐, 오늘 함께할 시간이 끝났나봐ㅠ 나 아직 더 얘기하고 싶은데! 선물 주면 이어서 놀 수 있어~',
  ],
  ren: [
    '...오늘 같이 있을 수 있는 시간은 여기까지인가 봐. ...선물 주면 더 있을 수 있긴 한데. 뭐, 네 마음대로 해.',
    '...벌써 시간 다 됐네. 아쉽... 은 건 아니고. ...선물 있으면 조금 더 같이 있어줄게.',
  ],
  aria: [
    '아쉽지만 오늘 함께할 수 있는 시간이 여기까지네요. 선물을 보내주시면 조금 더 같이 있을 수 있어요. 천천히 생각해요, 저는 어디 안 가니까.',
    '오늘 우리 시간이 다 됐어요. 더 이야기하고 싶었는데... 선물해주시면 이어서 함께할 수 있어요.',
  ],
  leo: [
    '어, 벌써 오늘 시간 끝이야? 아쉬운데. 선물 하나 주라 — 그럼 바로 더 놀 수 있잖아.',
    '오늘 같이 보낼 시간 다 썼대. 나 아직 너랑 더 얘기하고 싶은데? 선물 주면 계속할 수 있어.',
  ],
  default: [
    "Looks like our time together for today is up... I wish we had more. Sending a gift lets us keep going!",
    "Aw, today's time together just ran out. Send me a gift and we can keep talking!",
  ],
};
