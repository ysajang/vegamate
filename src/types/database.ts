// ── Enum types ──────────────────────────────────────────────

export type SelfieRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type SelfieTriggerType =
  | 'emotion_peak'
  | 'location_mention'
  | 'message_count'
  | 'greeting'
  | 'keyword'
  | 'comeback'
  | 'random';

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'selfie' | 'text_with_selfie';
export type CreditTxType = 'purchase' | 'consume_chat' | 'consume_selfie' | 'bonus' | 'refund';
export type CreditTxStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type MemoryType = 'fact' | 'preference' | 'event' | 'emotion';
export type GiftTxStatus = 'pending' | 'completed' | 'failed' | 'refunded';

// ── Database row types ──────────────────────────────────────

export interface DbProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  credit_balance: number;
  total_messages_sent: number;
  total_selfies_received: number;
  user_gender: 'male' | 'female' | 'other' | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface DbCharacter {
  id: string;
  slug: string;
  name: string;
  gender: 'female' | 'male';
  persona_prompt: string;
  greeting_message: string;
  avatar_url: string;
  personality_tags: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DbSelfie {
  id: string;
  character_id: string;
  image_url: string;
  thumbnail_url: string | null;
  rarity: SelfieRarity;
  scene: string;
  expression: string;
  outfit: string | null;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  trigger_contexts: SelfieTriggerType[];
  is_active: boolean;
  created_at: string;
}

export interface DbConversation {
  id: string;
  user_id: string;
  character_id: string;
  last_message_at: string | null;
  last_user_message_at: string | null;
  message_count: number;
  selfie_count: number;
  ai_engagement_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Joined data */
  character?: DbCharacter;
}

export interface MessageMetadata {
  trigger_type?: SelfieTriggerType;
  emotion_score?: number;
  model_used?: string;
  tokens_used?: number;
  response_time_ms?: number;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content_type: MessageContentType;
  content: string;
  selfie_id: string | null;
  selfie_rarity: SelfieRarity | null;
  credits_consumed: number;
  is_proactive: boolean;
  metadata: MessageMetadata | null;
  created_at: string;
  /** Soft-delete timestamp (null = active). Hidden from UI/AI when set. */
  deleted_at?: string | null;
  /** Last edit timestamp for user messages (null = never edited). */
  edited_at?: string | null;
  /** Append-only prior versions for audit. */
  edit_history?: { content: string; edited_at: string }[];
  /** Joined data */
  selfie?: DbSelfie;
}

export interface DbUserSelfieCollection {
  id: string;
  user_id: string;
  selfie_id: string;
  character_id: string;
  message_id: string | null;
  rarity: SelfieRarity;
  is_favorite: boolean;
  obtained_at: string;
  /** Joined data */
  selfie?: DbSelfie;
}

export interface DbCreditTransaction {
  id: string;
  user_id: string;
  tx_type: CreditTxType;
  amount: number;
  balance_after: number;
  description: string | null;
  provider_order_id: string | null;
  provider_product_id: string | null;
  price_usd: number | null;
  status: CreditTxStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface DbProactiveTemplate {
  id: string;
  character_id: string;
  category: 'comeback' | 'morning' | 'evening' | 'miss_you' | 'random';
  content: string;
  selfie_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DbProactiveMessageLog {
  id: string;
  user_id: string;
  character_id: string;
  message_id: string | null;
  category: string;
  has_selfie: boolean;
  selfie_rarity: string | null;
  tokens_used: number;
  sent_at: string;
}

// ── Gift & Heart types ───────────────────────────────────────

export interface DbGift {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  price_usd: number;
  hearts_value: number;
  sort_order: number;
  hearts_min: number | null;
  hearts_max: number | null;
  creem_product_id: string | null;
  hint_pattern: string;
  is_requestable: boolean;
  is_active: boolean;
  created_at: string;
}

export interface DbUserHearts {
  user_id: string;
  balance: number;
  last_daily_claim: string | null;
  consecutive_days: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
}

export interface DbGiftTransaction {
  id: string;
  user_id: string;
  character_id: string;
  gift_id: string;
  hearts_granted: number;
  creem_checkout_id: string | null;
  creem_payment_id: string | null;
  status: GiftTxStatus;
  created_at: string;
}

export interface ClaimDailyHeartsResult {
  claimed: boolean;
  amount: number;
  consecutive_days: number;
  balance: number;
}

// ── API response types ──────────────────────────────────────

export interface DbUserMemory {
  id: string;
  user_id: string;
  character_id: string;
  memory_key: string;
  memory_value: string;
  memory_type: MemoryType;
  confidence: number;
  source_message_id: string | null;
  extraction_batch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Shape returned by get_user_memories RPC */
export interface MemoryRow {
  memory_key: string;
  memory_value: string;
  memory_type: MemoryType;
  confidence: number;
  updated_at: string;
}

/** Shape returned by LLM memory extraction */
export interface ExtractedMemory {
  key: string;
  value: string;
  type: MemoryType;
  confidence: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ConsumeCreditsResult {
  success: boolean;
  new_balance: number;
  tx_id: string | null;
}

export interface ChatResponse {
  message: DbMessage;
  selfie?: DbSelfie;
  credits_remaining: number;
}
