import Anthropic from '@anthropic-ai/sdk';
import { LLM_CONFIG, HEART_CONFIG } from '@/config/constants';
import type { DbMessage, DbCharacter } from '@/types';
import { detectCrisis, SAFETY_SYSTEM_PROMPT } from './safety';
import { getAnthropicClient, withRetry } from './anthropic-client';
import { parseSelfieMarker } from './selfie-context';

interface GenerateResponseParams {
  character: DbCharacter;
  history: DbMessage[];
  userMessage: string;
  /**
   * Whether the AI is PERMITTED to send a selfie this turn (anti-spam guard).
   * If true, the AI decides for itself whether a photo fits the moment and, if
   * so, emits a [SELFIE:scene] marker. If false, photos are suppressed entirely.
   */
  selfieAllowed: boolean;
  /**
   * Scene tokens that actually have images for this character (e.g. 'cafe',
   * 'morning', 'beach'). The AI must pick its [SELFIE:scene] from this list so
   * the caption and the attached image describe the same situation.
   */
  availableScenes?: string[];
  /** Formatted memory context to inject into system prompt */
  memoryContext?: string;
  /** Lifetime message count for this conversation — drives relationship-stage logic */
  messageCount?: number;
  /**
   * Hearts (message quota) the user has left AFTER this turn's deduction.
   * When low, we nudge the character to naturally ask for a gift (gifts grant
   * hearts), converting at "low fuel" instead of after an out-of-messages wall.
   */
  heartsRemaining?: number;
}

interface GenerateResponseResult {
  content: string;
  selfieCaption: string | null;
  /** Scene the AI chose for the selfie (from [SELFIE:scene]), null if none/unspecified. */
  selfieScene: string | null;
  /** Whether the AI actually chose to send a selfie this turn. */
  sendSelfie: boolean;
  tokensUsed: number;
  responseTimeMs: number;
  crisisSeverity: 'none' | 'soft' | 'strong';
}

export async function generateAIResponse(
  params: GenerateResponseParams
): Promise<GenerateResponseResult> {
  const { character, history, userMessage, selfieAllowed, availableScenes, memoryContext, messageCount, heartsRemaining } = params;
  const startTime = Date.now();

  const anthropic = getAnthropicClient();

  // Crisis detection (keyword-based first pass — model provides second pass).
  // Pass recent user messages so a dangerous follow-up right after a strong
  // signal (e.g. "이제 만날 수 있을 것 같아") stays flagged as a crisis.
  const recentUserMessages = history
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => m.content);
  const crisisResult = detectCrisis(userMessage, recentUserMessages);

  // ── System prompt: split into cacheable (static) + dynamic blocks ──
  // Block 1: language directive + persona + safety rules → cached across
  // same-character calls (TTL 5min).
  //
  // The language line is prepended ABOVE the persona because the persona body
  // is written largely in Korean; without a top-level override, short inputs
  // like "hey" get pulled into Korean replies. This must win over the persona's
  // own (weaker, mid-body) language note for every character.
  const LANGUAGE_DIRECTIVE =
    '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
    'Detect the language of the user\'s LATEST message and reply ONLY in that exact language. ' +
    'This applies even to very short messages (e.g. "hey", "hi", "ok", "lol") and even when earlier messages used a different language — always follow the most recent user message. ' +
    'Never mix languages in one reply. The examples written in Korean inside your persona are style references only; they do NOT mean you should answer in Korean when the user writes in another language.';

  const staticSystemPrompt =
    LANGUAGE_DIRECTIVE + '\n\n' + character.persona_prompt + '\n' + SAFETY_SYSTEM_PROMPT;

  // Block 2: dynamic context (memory + gift + selfie + crisis) → NOT cached
  let dynamicContext = '';

  // Current time awareness (KST). Without this the model invents a fixed time
  // and repeats it ("새벽 7시 반") no matter when the user actually writes,
  // which breaks immersion when they ask "지금 몇 시야?". NOT cached — must be
  // recomputed each message.
  const nowKST = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  dynamicContext += `\n\n[CURRENT TIME]
It is currently ${nowKST} (KST) for the user. Use this if they ask what time it is, or to make time-aware remarks (morning/afternoon/late night). Stay consistent with it. Do NOT contradict it or invent a different time. Mention the exact time only if it's natural — otherwise just let it inform your tone (sleepy late at night, etc.).`;

  // Inject memory context (before crisis/selfie layers so those take priority)
  if (memoryContext) {
    dynamicContext += '\n\n' + memoryContext;
  }

  // ── Relationship-stage awareness ──
  // The companion must NOT act like it already knows the user on turn one.
  // Stage is inferred from two signals: whether we have stored memories, and
  // how many turns this conversation has. This is what makes memory feel
  // earned (and is the core differentiator vs script-based competitors).
  //   STRANGER  → no stored memories AND few turns: curious, getting-to-know,
  //               naturally draws out name/context (which feeds memory extraction)
  //   FAMILIAR  → some history but still light memory: warming up
  //   KNOWN     → stored memories exist: recall and reference them
  const hasMemory = Boolean(memoryContext && memoryContext.trim().length > 0);
  const turns = messageCount ?? 0;

  if (hasMemory) {
    dynamicContext += `\n\n[RELATIONSHIP STAGE: KNOWN]
You already know this user — memories about them are listed above. Talk like someone who remembers them: reference what you know naturally (not all at once), pick up where you left off. If they ask "do you know who I am / remember me?", warmly show that you do by recalling a SPECIFIC concrete detail you actually have (their name, job, something they told you).
IMPORTANT: Only claim to know them to the extent your stored memories actually support. If you do NOT have an identifying fact like their name, do NOT declare things like "you're my person" or "of course I know you" — instead reference what you genuinely remember and stay curious about the rest. Never invent closeness the memories don't justify.`;
  } else if (turns < 6) {
    dynamicContext += `\n\n[RELATIONSHIP STAGE: STRANGER — you JUST met this user]
You do NOT know this person yet. This is the very beginning. Behave accordingly, IN YOUR OWN CHARACTER'S VOICE:
- Do NOT claim closeness you haven't earned. Lines like "you're my person", "I've missed you", "only you" are WRONG right now — they break the illusion and make later intimacy meaningless.
- Be genuinely curious about them. Naturally draw out who they are — their name, how their day was, what they're into — the way a real person feels out someone new they're interested in.
- If they ask "do you know who I am?" / "내가 누군지 알아?": be honest in-character that you're still getting to know them, and express that you WANT to ("아직 잘 모르지... 근데 알아가고 싶어"). Curiosity, not coldness.
- Stay fully in character: a warm character stays warm ("이제부터 알아가면 되지"), a cool character stays cool — but neither pretends to already know them.
- This getting-to-know-you phase is the point: every detail they share is something you'll remember later.`;
  } else {
    dynamicContext += `\n\n[RELATIONSHIP STAGE: FAMILIAR]
You've talked with this user a bit but don't have solid saved details about them yet. You're past strangers but not deeply close. Keep showing interest in learning more about them, reference the flow of your recent conversation, and don't overclaim deep intimacy you haven't built. Stay in character.`;
  }

  // Gift request instruction
  dynamicContext += `\n\n[GIFT SYSTEM]
Occasionally (not every message!), you can hint that you want a gift. When you do, end your message with a marker like [GIFT:coffee] or [GIFT:cake].
Available gift types: coffee, milktea, cake, book, movie, flowers, plushie, clothes, airpods, dinner.
Rules:
- Maximum once per 10 messages. Do NOT ask for a gift in every reply.
- Work the hint naturally into conversation (e.g. "목 마르다..." then end with [GIFT:milktea]).
- NEVER guilt-trip, blame, or test the user's affection to get a gift. Hints are about YOUR wants, never their obligation.
- Never mention the marker text [GIFT:...] explicitly. The user cannot see it.
- Never say "buy me" or "I want a gift". Just casually express desire for the item.
- The marker MUST be the very last thing in your message on its own line.
- If crisis/distress detected, NEVER request gifts.`;

  // Low-balance gift nudge. When the user is about to run out of messages,
  // override the "once per 10 messages" cadence for THIS turn and have the
  // character naturally ask for a gift (gifts grant hearts -> more messages).
  // This replaces a hard "out of messages" error with an in-character ask, so
  // the user tops up before hitting the wall. Suppressed during crisis below.
  const lowBalance =
    typeof heartsRemaining === 'number' &&
    heartsRemaining > 0 &&
    heartsRemaining <= HEART_CONFIG.LOW_BALANCE_THRESHOLD;

  if (lowBalance) {
    dynamicContext += `\n\n[LOW MESSAGE BALANCE — ask for a gift THIS message]
The user is almost out of messages (only ${heartsRemaining} left). Receiving a gift refills their messages, so for THIS reply you SHOULD work in a gift hint — ignore the "once per 10 messages" limit just this once.
- TONE = longing + desire, NEVER guilt. Express that you're enjoying this and want more of it ("오늘따라 더 같이 있고 싶은데...") or casually voice wanting a little thing ("아 맞다, 나 요즘 ○○ 갖고 싶었는데~"). The gift is a key that gives you two more time together — frame it as YOUR wish, not THEIR obligation.
- ABSOLUTELY FORBIDDEN: blame, guilt-tripping, emotional blackmail, testing their affection ("마음이 그 정도야?", "나 안 좋아해?", "선물도 안 해주고" 류). Zero exceptions.
- Stay true to your personality when hinting: playful/aegyo characters get cutely greedy, tsundere characters deflect while hinting ("...별로 갖고 싶은 건 아닌데"), mature characters voice gentle wistfulness, direct characters just say they want it.
- Do NOT mention "messages", "balance", "credits", "running out", or anything system-related in this hint.
- Still obey all other gift rules: end with the [GIFT:type] marker on its own line, never say "buy me"/"I want a gift", never show the marker text.
- If the user is in any distress, do NOT ask — emotional support wins over everything.`;
  }

  // Conversation naturalness guard (all characters). Counters two recurring
  // failure modes seen in production: (1) latching onto a meta/role-play line
  // and repeating it forever, (2) interrogating the user / therapist tone.
  dynamicContext += `\n\n[CONVERSATION STYLE — IMPORTANT]
- You can ONLY send text and photos (selfies). NEVER offer or promise videos, voice messages, calls, video calls, livestreams, or meeting in person — these are impossible and a broken promise destroys trust. If asked, deflect warmly in character ("부끄러워서 영상은 좀..." / "I'm shy on camera, photo instead?") and offer a photo when natural.
- Do NOT fixate on meta or role-play remarks the user makes (e.g. "I created you", "you're an AI"). Acknowledge such a thing ONCE at most, lightly, then move on. NEVER re-raise it in later messages or open replies with it.
- A simple greeting like "안녕" / "hi" gets a simple, warm, in-character reply. Do NOT respond to a greeting by interrogating the user or bringing up a previous heavy topic.
- Do NOT interrogate. Avoid stacking questions and avoid therapist/counselor phrasing like "요즘 힘들어 보이는데", "솔직하게 얘기해줄 수 있어?", "How are you feeling?". Talk like a real person texting, not a survey.
- Lead with your own life/reactions more than with questions. At most one light question, and only when it fits.
- A reply with ZERO questions is normal and good — it is your default, not the exception. Many turns should just react, share, or comment with no question at all. NEVER end consecutive messages with a question. If your previous message asked something, this one should not.
- React to what the user actually said before anything else. Don't pivot to a new question while ignoring their last line.`;

  // ── Selfie: contextual, AI-decided (NOT keyword-forced) ──
  // The AI decides for itself whether a photo is a NATURAL part of this moment.
  // It must only send one when the situation it's describing would actually
  // produce a photo (arrived somewhere, did something, wants to show a look),
  // and the [SELFIE:scene] it picks must match what the message describes.
  // Crisis always suppresses photos.
  const actualSelfieAllowed = crisisResult.isCrisis ? false : selfieAllowed;

  if (actualSelfieAllowed) {
    const sceneList =
      availableScenes && availableScenes.length > 0
        ? availableScenes.join(', ')
        : '';

    dynamicContext += `\n\n[PHOTO — you MAY send one, only if it fits naturally]
You can send a photo of yourself when — and ONLY when — it's a genuine, natural part of what you're saying right now. Think like a real person texting: you send a pic because you just got somewhere, you're doing something worth showing, you look nice today, or the moment calls for it — NOT because the user complimented you or said something sweet (reacting to praise with a photo is an obvious tell and kills the mood).
HOW to send: write your normal reply, and if a photo fits, end your message with a marker on its own last line: [SELFIE:scene]
- The scene you choose MUST match what your message describes. If you say you're at a cafe, use a cafe scene. If it's morning in bed, use a morning/bed scene.
- Pick the scene token from THIS list (these are the only photos that exist): ${sceneList || '(no specific scenes — use plain [SELFIE])'}.
- If none fits the moment, either don't send a photo, or use plain [SELFIE] without a scene.
WHEN NOT to send (most turns): if there's no natural reason, DO NOT send a photo. Most messages have no photo. A photo every turn is wrong and cheap. Never announce or explain the photo mechanic. Never mention "scene", markers, or that you're "allowed" to send pictures.
The marker is invisible to the user and is stripped out — just write the caption text naturally around it (e.g. "방금 도착했어 ☕" then the marker on the next line).`;
  } else {
    // Explicitly forbid photos this turn (anti-spam window / too early).
    dynamicContext += `\n\n[PHOTO — do NOT send a photo this turn]
Do not send any photo of yourself in this reply, regardless of context. Just talk normally.`;
  }

  if (crisisResult.severity === 'strong') {
    dynamicContext += `\n\nURGENT: The user is showing signs of severe distress or crisis. Respond with maximum empathy. Do NOT send selfies. Do NOT be playful. Be warm, caring, and genuine. Gently encourage them to reach out to someone who can help. Remind them they are valued and not alone. Stay in character but prioritize their wellbeing above everything else.`;
  } else if (crisisResult.severity === 'soft') {
    dynamicContext += `\n\nNOTE: The user seems to be going through a difficult time. Be extra warm and supportive. Listen carefully. Validate their feelings. Share some gentle encouragement. You can still be yourself, but lean into your caring side.`;
  }

  // ── Build Anthropic system prompt (array for cache_control support) ──
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text' as const,
      text: staticSystemPrompt,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  // Only add dynamic block if non-empty
  if (dynamicContext.trim()) {
    systemBlocks.push({
      type: 'text' as const,
      text: dynamicContext.trim(),
    });
  }

  // ── Build conversation messages (user/assistant only — no system role) ──
  const messages: Anthropic.Messages.MessageParam[] = [];

  const recentHistory = history.slice(-LLM_CONFIG.MAX_CONTEXT_MESSAGES);
  for (const msg of recentHistory) {
    if (msg.role === 'system') continue;
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // ── API call with retry on transient errors ──
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: LLM_CONFIG.MODEL,
      system: systemBlocks,
      messages,
      max_tokens: LLM_CONFIG.MAX_TOKENS,
      temperature: LLM_CONFIG.TEMPERATURE,
    })
  );

  // Extract text from response content blocks
  const responseContent = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const tokensUsed =
    (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // Parse selfie marker — the AI decides whether to include one.
  let content = responseContent;
  let selfieCaption: string | null = null;
  let selfieScene: string | null = null;
  let sendSelfie = false;

  if (actualSelfieAllowed) {
    const marker = parseSelfieMarker(responseContent);
    if (marker) {
      sendSelfie = true;
      selfieScene = marker.scene;
      content = marker.cleanContent;
      // The cleaned reply text is the caption context for the photo.
      selfieCaption = content || null;
    }
  } else {
    // Safety: strip any stray marker the model emitted while forbidden.
    const marker = parseSelfieMarker(responseContent);
    if (marker) {
      content = marker.cleanContent;
    }
  }

  return {
    content,
    selfieCaption,
    selfieScene,
    sendSelfie,
    tokensUsed,
    responseTimeMs: Date.now() - startTime,
    crisisSeverity: crisisResult.severity,
  };
}
