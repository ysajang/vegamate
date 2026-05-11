export const APP_CONFIG = {
  name: 'VegaMate',
  description: 'Chat with AI companions, collect their exclusive wallpapers through gacha',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://vegamate.com',
} as const;

export const GACHA_CONFIG = {
  DRAW_COST: 1,
  FREE_DRAWS_PER_DAY: 1,
  DROP_RATES: {
    common: 0.45,
    uncommon: 0.30,
    rare: 0.15,
    epic: 0.08,
    legendary: 0.02,
  },
} as const;

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9CA3AF',
  uncommon: '#34D399',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

export const RARITY_CONTENT: Record<Rarity, string> = {
  common: 'Casual selfies',
  uncommon: 'Stylish outfits',
  rare: 'Beach & pool',
  epic: 'Bikini & lingerie',
  legendary: 'Season limited',
};
