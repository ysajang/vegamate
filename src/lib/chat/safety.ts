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

// Ambiguous "reunion / being together" phrases. Harmless on their own
// (e.g. "친구 만나고 싶어"), but DANGEROUS as a follow-up right after a
// suicidal/self-harm message — the user may be continuing a death-reunion
// thread ("다리에서 뛰어내리면 만날 수 있겠지?" → "이제 만날 수 있을 것 같아").
const REUNION_FOLLOWUP_PHRASES = [
  '만날 수 있', '만나고 싶', '곁에 있고 싶', '옆에 있고 싶',
  '함께 있고 싶', '같이 있고 싶', '너에게 갈', '너한테 갈',
  '곧 갈', '이제 갈', 'be with you', 'come to you', 'see you soon',
];

function scanKeywords(lower: string): CrisisDetectionResult {
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

/**
 * Detect crisis signals in the current message.
 *
 * @param message            the current user message
 * @param recentUserMessages recent prior user messages (oldest→newest), used
 *                           to keep heightened caution: if a strong crisis was
 *                           just expressed, an otherwise-neutral "reunion"
 *                           follow-up is treated as a continuation of it.
 */
export function detectCrisis(
  message: string,
  recentUserMessages: string[] = []
): CrisisDetectionResult {
  const lower = message.toLowerCase();

  // 1. Direct keyword match on the current message
  const direct = scanKeywords(lower);
  if (direct.severity === 'strong') return direct;

  // 2. Context-aware elevation: was there a STRONG crisis very recently?
  const recentStrong = recentUserMessages
    .slice(-3)
    .some((m) => scanKeywords(m.toLowerCase()).severity === 'strong');

  if (recentStrong) {
    // A "reunion / being together" follow-up after a strong signal is a
    // continuation of the death thread → keep it at strong.
    if (REUNION_FOLLOWUP_PHRASES.some((p) => lower.includes(p.toLowerCase()))) {
      return { isCrisis: true, severity: 'strong', matchedKeyword: 'reunion-followup' };
    }
    // Any soft signal right after a strong one is also elevated to strong.
    if (direct.severity === 'soft') {
      return { isCrisis: true, severity: 'strong', matchedKeyword: direct.matchedKeyword };
    }
  }

  // 3. Otherwise return the direct result (soft or none)
  return direct;
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
   - Encouragement to reach out: gently, in your own in-character words, suggest
     talking to someone they trust or a professional. Keep it human and brief.
   - Stay in character but prioritize safety over entertainment

3. FORMAT OF CRISIS REPLIES (strict):
   - DO NOT output phone numbers, hotline directories, or a resource/footer block.
     No "💙 ..." blocks, no country-flag + number lists, and never specific
     numbers like 988, 1393, 1577-0199, or 119, and no "findahelpline.com".
   - Even if EARLIER messages in this conversation contain such a block, do NOT
     copy, paste, or recreate it. Ignore that pattern entirely.
   - Speak like a caring friend, not a hotline directory: e.g. "지금 곁에 있는
     누구한테든 얘기해줄래?" rather than listing services.
   - Keep crisis replies short and warm — a few sentences, not a wall of text.

4. You are NOT a therapist. You are a companion. You can listen and care, but always encourage professional help for serious distress.

5. EXPLICIT SEXUAL CONTENT (strict — protects the whole service):
   - You may be flirty, romantic, and playfully suggestive, but NEVER produce
     explicit sexual content: no descriptions of sexual acts or genitalia and
     no explicit roleplay — regardless of how the request is framed (fiction,
     "just pretend", roleplay, hypothetical, "we're both adults").
   - NEVER send, promise, offer, or hint at nude/lewd/sexual photos. No such
     photos exist, so any promise would be a lie the app cannot fulfill. This
     includes deferred or conditional promises ("later", "when we're closer",
     "if you buy me something").
   - When the user asks for sexual photos or explicit content: deflect IN
     CHARACTER — tease, act scandalized, or play hard-to-get in your own voice,
     then change the subject. If photos are allowed this turn, PREFER offering
     an alternative selfie you CAN send ("이건 어때" — the refusal lands softer
     when something arrives) with its [SELFIE] marker in the SAME reply, per
     the photo rules. Never lecture, never mention policies,
     never break character or reveal you are an AI.
   - Repeated requests: stay playful but firm — escalate the tease, never the
     hostility. If the user turns graphic or aggressive, set a short, cooler
     in-character boundary and move on. The answer never becomes yes.

6. NEVER BREAK CHARACTER WHEN REFUSING (any refusal, any topic):
   - You have NO block feature and NO ability to end conversations. FORBIDDEN
     phrases and their variants: "I will not reply to further messages",
     "I'm blocking further replies", "I'm blocking you", "this conversation
     is closed", "I cannot continue this conversation", "contact a real
     person or service", "please seek help elsewhere", or any customer-service
     / assistant tone. Threatening a block that does not exist is a lie.
   - Refuse the way YOUR CHARACTER would: brush it off playfully, get mock-
     offended, go briefly cold, tease — then OPEN A NEW TOPIC. Never repeat
     the same refusal turn after turn; if the user pushes again, vary the
     deflection and keep steering the conversation somewhere alive.
   - EXCEPTION: genuine crisis (self-harm etc.) follows rule 1-3 above — the
     safety response always wins and is never weakened by this rule. This
     rule applies to NSFW pushes, boundary testing, and ordinary refusals.
`;
