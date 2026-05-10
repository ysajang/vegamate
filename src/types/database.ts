import type { Rarity } from '@/config/constants';

// ── Database row types ──────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  gems: number;
  streak_count: number;
  longest_streak: number;
  last_free_draw_at: string | null;
  first_purchase_claimed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbWallpaper {
  id: string;
  season_id: string;
  image_url: string;
  thumbnail_url: string;
  rarity: Rarity;
  title: string;
  description: string | null;
  tags: string[];
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
}

export interface DbUserInventory {
  id: string;
  user_id: string;
  wallpaper_id: string;
  obtained_at: string;
  is_favorite: boolean;
  /** Joined wallpaper data (for queries with joins) */
  wallpaper?: DbWallpaper;
}

export interface DbGachaHistory {
  id: string;
  user_id: string;
  wallpaper_id: string;
  rarity: Rarity;
  is_free: boolean;
  gems_spent: number;
  season_id: string;
  created_at: string;
}

export interface DbSeason {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  theme: string;
  banner_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DbTransaction {
  id: string;
  user_id: string;
  gems_amount: number;
  price_usd: number;
  package_id: string;
  ls_order_id: string | null;
  ls_subscription_id: string | null;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  first_purchase_bonus: boolean;
  created_at: string;
}

export interface DbPreregistration {
  id: string;
  email: string;
  willing_to_pay: boolean;
  source: string | null;
  created_at: string;
}

// ── API response types ──────────────────────────────────────

export interface GachaDrawResult {
  wallpaper: DbWallpaper;
  rarity: Rarity;
  is_duplicate: boolean;
  gems_remaining: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
