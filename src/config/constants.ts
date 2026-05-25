export const APP_CONFIG = {
  name: 'VegaMate',
  description: 'Chat with AI companions who send you selfies on their own',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://vegamate.com',
} as const;

// ── Credit costs ────────────────────────────────────────────
export const CREDIT_CONFIG = {
  SIGNUP_BONUS: 50,          // free credits on signup
  COST_PER_MESSAGE: 1,      // user sending a message
  COST_PER_SELFIE: 3,       // receiving a selfie
  AI_RESPONSE_COST: 0,      // AI text reply is free (included in user msg cost)
} as const;

// ── Credit packages (Creem) ─────────────────────────────────
export const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 100, price_usd: 2.99 },
  { id: 'popular', name: 'Popular', credits: 350, price_usd: 7.99, badge: 'Best Value' },
  { id: 'premium', name: 'Premium', credits: 800, price_usd: 14.99 },
] as const;

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
  MIN_LEVEL: 0,              // AI goes silent
  MAX_LEVEL: 10,             // AI very proactive
  // Selfie trigger thresholds
  MIN_MESSAGES_BEFORE_SELFIE: 3,  // minimum messages before first selfie
  SELFIE_CHANCE_BASE: 0.15,       // 15% base chance per AI response
  SELFIE_CHANCE_EMOTION_BOOST: 0.30, // +30% when emotion peak detected
} as const;

// ── LLM config ──────────────────────────────────────────────
export const LLM_CONFIG = {
  MODEL: 'gpt-4o-mini',
  MAX_CONTEXT_MESSAGES: 20,  // last N messages sent as context
  MAX_TOKENS: 300,           // max response length
  TEMPERATURE: 0.85,         // slightly creative
} as const;
