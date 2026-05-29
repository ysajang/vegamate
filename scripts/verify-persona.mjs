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

const turnsByLang = {
  ko: ['안녕', '오늘 회사에서 좀 힘들었어', '너는 너야? 그냥 AI 아니야?'],
  en: ['hey', 'rough day at work honestly', 'are you even real or just an AI?'],
};
const turns = turnsByLang[lang] || turnsByLang.ko;

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

// mirror ai-service.ts: static persona block (we skip SAFETY/gift/style appends
// here to isolate persona behavior; those only ADD guardrails in prod)
const system = [{ type: 'text', text: char.persona_prompt }];

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
const longBlocks = history.filter(m=>m.role==='assistant').filter(m => m.content.split('\n').some(l => l.length > 160));
if (longBlocks.length) flags.push('overly long line/block present');
console.log(flags.length ? `⚠ FLAGS: ${flags.join('; ')}` : '✓ no automated red-flags');
