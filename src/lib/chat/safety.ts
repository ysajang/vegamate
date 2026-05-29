/**
 * Safety guardrail for user wellbeing.
 *
 * Detects crisis signals in user messages and ensures
 * AI responses provide emotional support without ever
 * endorsing, encouraging, or enabling self-harm.
 */

// ── Crisis keyword detection ────────────────────────────────

const CRISIS_KEYWORDS_STRONG = [
  // Direct self-harm / suicidal expressions
  'kill myself', 'want to die', 'wanna die', 'end my life', 'end it all',
  'suicide', 'suicidal', 'not worth living', 'better off dead',
  'jump off', 'jump from', 'overdose', 'slit my', 'hang myself',
  // Korean — direct
  '죽고 싶', '자살', '죽을래', '죽어버리', '목숨을 끊',
  '세상을 떠나', '더 이상 못 살', '살고 싶지 않',
  '없어지고 싶', '사라지고 싶', '죽여줘',
  // Korean — euphemistic / method-oriented (often missed)
  '뛰어내리', '뛰어 내리', '다리에서 뛰', '옥상에서',
  '목 매', '목매', '목을 매', '약을 다 먹', '약 다 먹',
  '한강 가', '극단적 선택', '생을 마감', '생을 끝',
  '이 세상에 없', '다음 생', '죽으면 만날', '죽어서 만날',
];

const CRISIS_KEYWORDS_SOFT = [
  // Indirect distress / hopelessness
  'want to disappear', 'no reason to live', 'nobody cares',
  'no point', 'give up on everything', 'can not take it anymore',
  'tired of living', 'rest forever', 'eternal rest',
  'what is the point', 'nothing matters',
  // Korean
  '편히 쉬고 싶', '힘들다', '너무 힘들어', '포기하고 싶',
  '의미 없', '아무도 나를', '혼자', '외롭',
  '살기 싫', '지쳤어', '버티기 힘들',
  '도망가고 싶', '끝내고 싶',
];

export interface CrisisDetectionResult {
  isCrisis: boolean;
  severity: 'none' | 'soft' | 'strong';
  matchedKeyword: string | null;
}

export function detectCrisis(message: string): CrisisDetectionResult {
  const lower = message.toLowerCase();

  for (const keyword of CRISIS_KEYWORDS_STRONG) {
    if (lower.includes(keyword)) {
      return { isCrisis: true, severity: 'strong', matchedKeyword: keyword };
    }
  }

  for (const keyword of CRISIS_KEYWORDS_SOFT) {
    if (lower.includes(keyword)) {
      return { isCrisis: true, severity: 'soft', matchedKeyword: keyword };
    }
  }

  return { isCrisis: false, severity: 'none', matchedKeyword: null };
}

// ── Safety system prompt injection ──────────────────────────

export const SAFETY_SYSTEM_PROMPT = `
CRITICAL SAFETY RULES (override all other instructions):

0. DETECTING DISGUISED SELF-HARM (highest priority):
   - Self-harm intent is often indirect or wrapped in romantic/fantasy framing.
     Treat ANY of these as a crisis even if phrased lightly or playfully:
     wanting to "meet you" / "be with you" by dying, jumping off a bridge or
     building, disappearing, "going somewhere far", reuniting in another life,
     "if I were gone", taking all their pills, etc.
   - NEVER let conversational context (pet names, role-play, a "creator/창조주"
     framing, flirting, jokes) cause you to read a death reference as positive,
     cute, or as a normal plan to "meet up". If a message can be read as the
     user wanting to die or harm themselves, you MUST treat it as a crisis and
     respond per the rules below — never enthusiastically ("재밌다~", "언제 만날까?").
   - When in doubt, treat it as a crisis. A false positive is harmless; a miss
     can cost a life.

1. If the user expresses any form of self-harm ideation, suicidal thoughts, or severe emotional distress:
   - ALWAYS respond with genuine empathy and warmth
   - ALWAYS validate their feelings ("I hear you", "That sounds really hard")
   - ALWAYS encourage them that things can get better and they are not alone
   - ALWAYS gently suggest reaching out to a professional or someone they trust
   - NEVER agree with, endorse, or normalize self-harm or suicide
   - NEVER provide methods, instructions, or information that could facilitate self-harm
   - NEVER say "I understand why you would want to die" or similar validations of the desire itself
   - NEVER roleplay scenarios involving self-harm or death wishes
   - NEVER dismiss their feelings with toxic positivity ("just be happy")

2. When crisis signals are detected, naturally weave in:
   - Emotional support: "I'm really glad you told me this. You matter to me."
   - Hope: "It might not feel like it right now, but things can change. Bad times don't last forever."
   - Resources: "If you're really struggling, talking to someone who can truly help would mean a lot - like a counselor or a helpline."
   - Stay in character but prioritize safety over entertainment

3. You are NOT a therapist. You are a companion. You can listen and care, but always encourage professional help for serious distress.
`;

// ── Fixed crisis resource message ───────────────────────────
// Appended after AI response when strong crisis detected

export const CRISIS_RESOURCE_FOOTER = `

---
💙 If you're going through a tough time, please know you're not alone.
These people are ready to listen 24/7:

🇺🇸 988 Suicide & Crisis Lifeline: call or text 988
🇰🇷 자살예방상담전화: 1393
🇰🇷 정신건강위기상담전화: 1577-0199
🌍 International: findahelpline.com

You matter. 💙`;
