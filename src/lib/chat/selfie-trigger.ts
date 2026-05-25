import type { SelfieTriggerType } from '@/types';
import { ENGAGEMENT_CONFIG } from '@/config/constants';

interface TriggerContext {
  userMessage: string;
  messageCount: number;
  aiEngagementLevel: number;
  lastSelfieMessageIndex: number | null; // how many messages ago was last selfie
  isComeback: boolean; // user returning after absence
}

interface TriggerResult {
  shouldSendSelfie: boolean;
  triggerType: SelfieTriggerType;
  confidence: number; // 0-1
}

const EMOTION_KEYWORDS = [
  'love', 'miss', 'cute', 'beautiful', 'handsome', 'pretty',
  'thank', 'amazing', 'perfect', 'best', 'happy', 'heart',
  'crush', 'like you', 'love you', 'adore',
  '사랑', '보고 싶', '좋아', '이쁘', '예쁘', '고마워', '최고',
];

const LOCATION_KEYWORDS = [
  'cafe', 'coffee', 'restaurant', 'gym', 'beach', 'park',
  'school', 'work', 'home', 'bed', 'shower', 'mall',
  'library', 'club', 'bar', 'movie',
  '카페', '집', '학교', '회사', '헬스장', '바다', '공원',
];

const GREETING_KEYWORDS = [
  'good morning', 'good night', 'gm', 'gn',
  'morning', 'night', 'hello', 'hi', 'hey',
  '좋은 아침', '굿모닝', '잘자', '안녕',
];

const SELFIE_REQUEST_KEYWORDS = [
  'selfie', 'photo', 'pic', 'picture', 'see you', 'show me',
  'what do you look', 'send me',
  '셀카', '사진', '보여줘', '얼굴',
];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function evaluateSelfieTrigger(ctx: TriggerContext): TriggerResult {
  const { userMessage, messageCount, aiEngagementLevel, lastSelfieMessageIndex, isComeback } = ctx;

  // Too early for selfies
  if (messageCount < ENGAGEMENT_CONFIG.MIN_MESSAGES_BEFORE_SELFIE) {
    return { shouldSendSelfie: false, triggerType: 'random', confidence: 0 };
  }

  // Prevent selfie spam -> at least 5 messages since last selfie
  if (lastSelfieMessageIndex !== null && lastSelfieMessageIndex < 5) {
    return { shouldSendSelfie: false, triggerType: 'random', confidence: 0 };
  }

  // 1. User explicitly asking for selfie -> always send
  if (matchesKeywords(userMessage, SELFIE_REQUEST_KEYWORDS)) {
    return { shouldSendSelfie: true, triggerType: 'keyword', confidence: 0.95 };
  }

  // 2. Comeback trigger
  if (isComeback) {
    return { shouldSendSelfie: true, triggerType: 'comeback', confidence: 0.85 };
  }

  // 3. Emotion peak
  if (matchesKeywords(userMessage, EMOTION_KEYWORDS)) {
    const chance = ENGAGEMENT_CONFIG.SELFIE_CHANCE_BASE + ENGAGEMENT_CONFIG.SELFIE_CHANCE_EMOTION_BOOST;
    const roll = Math.random();
    return {
      shouldSendSelfie: roll < chance,
      triggerType: 'emotion_peak',
      confidence: chance,
    };
  }

  // 4. Location mention
  if (matchesKeywords(userMessage, LOCATION_KEYWORDS)) {
    const chance = ENGAGEMENT_CONFIG.SELFIE_CHANCE_BASE + 0.15;
    const roll = Math.random();
    return {
      shouldSendSelfie: roll < chance,
      triggerType: 'location_mention',
      confidence: chance,
    };
  }

  // 5. Greeting
  if (matchesKeywords(userMessage, GREETING_KEYWORDS)) {
    const chance = ENGAGEMENT_CONFIG.SELFIE_CHANCE_BASE + 0.10;
    const roll = Math.random();
    return {
      shouldSendSelfie: roll < chance,
      triggerType: 'greeting',
      confidence: chance,
    };
  }

  // 6. Random trigger (scaled by engagement level)
  const engagementMultiplier = aiEngagementLevel / 10; // 0.0 ~ 1.0
  const chance = ENGAGEMENT_CONFIG.SELFIE_CHANCE_BASE * engagementMultiplier;
  const roll = Math.random();
  return {
    shouldSendSelfie: roll < chance,
    triggerType: 'random',
    confidence: chance,
  };
}
