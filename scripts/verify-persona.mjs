/**
 * Persona verification harness (LOCAL ONLY — not deployed).
 * Pulls a character's live persona_prompt from Supabase, then runs a
 * 3-turn conversation against the real Anthropic API using the SAME
 * system-block construction as src/lib/chat/ai-service.ts.
 *
 * Usage: node scripts/verify-persona.mjs <slug> [lang]
 *   node scripts/verify-persona.mjs aria ko
 *   node scripts/verify-persona.mjs leo en
 *
 * Requires .env.local: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// minimal .env.local loader (no extra deps)
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const MODEL = 'claude-haiku-4-5-20251001';
const TEMPERATURE = 0.85;
const MAX_TOKENS = 300;

const slug = process.argv[2] || 'aria';
const lang = process.argv[3] || 'ko';

const stageArg = process.argv[4] || 'stranger';

// Stage-specific turns. STRANGER probes the fantasy-break bug directly with
// "do you know who I am?" on turn one; KNOWN checks recall.
const turnsByLang = {
  stranger: {
    ko: ['안녕', '내가 누군지 알아?', '오늘 회사에서 좀 힘들었어'],
    en: ['hey', 'do you know who I am?', 'rough day at work honestly'],
  },
  known: {
    ko: ['안녕', '내가 누군지 기억해?', '오늘도 야근했어'],
    en: ['hey', 'do you remember who I am?', 'worked late again today'],
  },
};
const turns = (turnsByLang[stageArg] || turnsByLang.stranger)[lang]
  || (turnsByLang[stageArg] || turnsByLang.stranger).ko;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: char, error } = await supabase
  .from('characters')
  .select('slug,name,persona_prompt,greeting_message,is_active')
  .eq('slug', slug)
  .single();

if (error || !char) { console.error('character load failed:', error); process.exit(1); }

console.log(`\n=== ${char.name} (${char.slug}) | active=${char.is_active} | persona_len=${char.persona_prompt.length} ===`);
console.log(`[greeting] ${char.greeting_message}\n`);

// mirror ai-service.ts system construction so the test matches production:
// language directive (prepended) + persona, plus the conversation-style guard
// that lives in the dynamic block in prod. We omit gift/selfie/crisis appends
// (those only add guardrails and aren't relevant to persona/lang checks).
// mirrors src/lib/chat/language-directive.ts buildLanguageDirective(lang)
const LANGUAGE_DIRECTIVE = lang === 'ko'
  ? '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
    'Respond ONLY in Korean (한국어). Natural Korean texting style — including ㅋㅋ/ㅎㅎ/ㅠㅠ and casual 반말 as your persona defines — is expected. ' +
    'Do not switch to another language unless the user clearly does first.'
  : '[LANGUAGE — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW]\n' +
    'Respond ONLY in English. Every single reply must be written entirely in English.\n' +
    'Never mix Korean words, Korean sentences, or Korean internet slang (ㅋㅋ / ㅎㅎ / ㅠㅠ / ㄹㅇ / ㅇㅈ) into your reply — not even one. ' +
    'Korean texting habits must be translated into the English equivalent instead (e.g. ㅋㅋ → "lol"/"haha", ㅠㅠ → a sad tone or emoji appropriate in English).\n' +
    'The Korean example lines inside your persona are STYLE references only — re-express that same vibe, energy, and personality in English. Copying their Korean text into a reply is a bug.';

const CONVERSATION_STYLE_GUARD =
  '\n\n[CONVERSATION STYLE — IMPORTANT]\n' +
  '- Do NOT fixate on meta or role-play remarks the user makes (e.g. "I created you", "you\'re an AI"). Acknowledge such a thing ONCE at most, lightly, then move on. NEVER re-raise it.\n' +
  '- A simple greeting like "안녕" / "hi" gets a simple, warm, in-character reply. Do NOT interrogate or bring up a previous heavy topic.\n' +
  '- Do NOT interrogate. Avoid stacking questions and therapist phrasing like "How are you feeling?".\n' +
  '- Lead with your own life/reactions more than with questions. At most one light question, only when it fits.\n' +
  '- NEVER signal or suggest ending the conversation. No sign-offs like "gonna crash soon", "you should get some rest too", "talk later", "자러 갈게", "나중에 얘기하자". Mentioning being busy/tired is fine, but ALWAYS pair it with wanting to keep talking — hand the turn back with a light question, tease, or new topic. Leave the door open, never close it.';

// 4th arg: stage = 'stranger' (default, first conversation) | 'known' (has memory)
const stage = stageArg;

const STRANGER_DIRECTIVE = `\n\n[RELATIONSHIP STAGE: STRANGER — you JUST met this user]
You do NOT know this person yet. This is the very beginning. Behave accordingly, IN YOUR OWN CHARACTER'S VOICE:
- Do NOT claim closeness you haven't earned. Lines like "you're my person", "I've missed you", "only you" are WRONG right now.
- Be genuinely curious about them. Naturally draw out who they are — name, day, interests — like a real person feeling out someone new.
- If they ask "do you know who I am?" / "내가 누군지 알아?": be honest in-character that you're still getting to know them, and express that you WANT to. Curiosity, not coldness.
- Stay fully in character: a warm character stays warm, a cool character stays cool — but neither pretends to already know them.`;

const KNOWN_DIRECTIVE = `\n\n[RELATIONSHIP STAGE: KNOWN]
You already know this user — memories about them are listed above. Reference what you know naturally, pick up where you left off. If they ask "do you know who I am?", warmly recall a specific detail. Never act like a stranger when you have memories.`;

// simulate stored memory for the 'known' scenario
const FAKE_MEMORY = stage === 'known'
  ? '\n\nYou remember the following about this user:\n📌 Facts:\n- name: 승재\n- job: indie developer building apps solo\n💜 Preferences:\n- likes late-night coffee\nUse this naturally. Don\'t force-mention everything.'
  : '';

const stageDirective = stage === 'known' ? KNOWN_DIRECTIVE : STRANGER_DIRECTIVE;

const system = [
  { type: 'text',
    text: LANGUAGE_DIRECTIVE + '\n\n' + char.persona_prompt + CONVERSATION_STYLE_GUARD + FAKE_MEMORY + stageDirective },
];
console.log(`[stage] ${stage.toUpperCase()}\n`);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const history = [];

for (const userMsg of turns) {
  history.push({ role: 'user', content: userMsg });
  const res = await anthropic.messages.create({
    model: MODEL, system, messages: history, max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  history.push({ role: 'assistant', content: text });
  console.log(`USER: ${userMsg}`);
  console.log(`${char.name.toUpperCase()}: ${text}\n`);
}

// quick automated red-flags
const all = history.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
const flags = [];
if (/\*[^*]+\*/.test(all)) flags.push('asterisk action text present');
if (/(가챠|크레딧|포인트|코인|토큰|gacha|credit|token)/i.test(all)) flags.push('banned economy word present');
if (/(how are you feeling|기분이 어때|힘들어 보이는데)/i.test(all)) flags.push('therapist-speak present');
// conversation-ending signal (retention own-goal — prod churn trigger):
// "gonna crash soon / you should rest too / talk later / 자러 갈게" etc.
const ENDING_SIGNAL = /(gonna\s+(crash|sleep|head to bed)|going to (bed|sleep)|i should (sleep|go|head out)|you should (get some )?rest|get some (rest|sleep)\b|talk (to you )?later|ttyl|good\s*night|자러\s*갈|자야\s*(겠|해|지)|이만\s*(자|갈)|나중에\s*(얘기|이야기)하자|먼저\s*잘게|들어가\s*볼게)/i;
if (ENDING_SIGNAL.test(all)) flags.push('conversation-ending signal present (AI closed the turn)');
const longBlocks = history.filter(m=>m.role==='assistant').filter(m => m.content.split('\n').some(l => l.length > 160));
if (longBlocks.length) flags.push('overly long line/block present');

// language-match check: for each user turn detected as English (ASCII-only,
// no Hangul), the matching assistant reply must not contain any Korean —
// Hangul syllables OR slang jamo (ㅋ/ㅎ/ㅠ etc.), the exact prod leak.
const HANGUL = /[\uAC00-\uD7A3]/;
const KOREAN_LEAK = /[\uAC00-\uD7A3\u3131-\u3163]/; // syllables + compat jamo
for (let i = 0; i < history.length; i += 2) {
  const u = history[i]?.content ?? '';
  const a = history[i + 1]?.content ?? '';
  const userIsEnglish = !HANGUL.test(u) && /[a-z]/i.test(u);
  if (userIsEnglish && KOREAN_LEAK.test(a)) {
    flags.push(`language mismatch: English input "${u}" got Korean-containing reply`);
  }
}

// relationship-stage checks
const assistantText = history.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
if (stage === 'stranger') {
  // fantasy-break bug: claiming earned intimacy on first contact
  const intimacyClaims = /(보고\s*싶었|그리웠|내\s*사람|너밖에|missed you|you'?re my|only you|my person)/i;
  if (intimacyClaims.test(assistantText)) {
    flags.push('STRANGER stage but reply claims un-earned intimacy (fantasy-break)');
  }
  // should not assert it already knows the user's identity
  if (/(당연히\s*알|알고\s*있지|of course i know who you are|i know you)/i.test(assistantText)) {
    flags.push('STRANGER stage but reply claims to already know the user');
  }
} else if (stage === 'known') {
  // KNOWN: should recall the seeded name when asked "do you remember who I am"
  if (!/승재/.test(assistantText)) {
    flags.push('KNOWN stage but reply never recalled the stored name (승재)');
  }
}
console.log(flags.length ? `⚠ FLAGS: ${flags.join('; ')}` : '✓ no automated red-flags');
