export const APP_CONFIG = {
  name: 'PRISM',
  description: 'Collect stunning AI wallpapers through daily gacha draws',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://prism.app',
} as const;

export const GACHA_CONFIG = {
  /** Cost per single draw in gems */
  DRAW_COST: 10,
  /** Free draws per day */
  FREE_DRAWS_PER_DAY: 1,
  /** Rarity drop rates (must sum to 1.0) */
  DROP_RATES: {
    normal: 0.6,
    rare: 0.3,
    epic: 0.08,
    legendary: 0.02,
  },
  /** Starting gems for new users */
  INITIAL_GEMS: 0,
} as const;

export const GEM_PACKAGES = [
  { id: 'gems_330', gems: 330, priceUsd: 4.99, label: '330 Gems' },
  { id: 'gems_700', gems: 700, priceUsd: 9.99, label: '700 Gems' },
  { id: 'gems_1500', gems: 1500, priceUsd: 19.99, label: '1,500 Gems' },
] as const;

/** First-purchase bonus gems */
export const FIRST_PURCHASE_BONUS = 100;

export const RARITY_ORDER = ['normal', 'rare', 'epic', 'legendary'] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  normal: 'Normal',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  normal: '#9CA3AF',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};
