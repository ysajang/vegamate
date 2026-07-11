/**
 * Gift-received reaction: after a gift purchase completes, the character
 * sends a thank-you message into the conversation (the "받는 순간").
 *
 * Why templates instead of an LLM call:
 *  - runs inside the payment fulfillment path (capture endpoint + PayPal
 *    webhook). An LLM call there adds 1–3s latency, a new failure mode, and
 *    webhook-timeout/retry noise on the single payment pipeline — the worst
 *    place in the product to add fragility.
 *  - the moment calls for a short, warm, instant reaction; long-tail quality
 *    comes later from the memory record (the character spontaneously brings
 *    the gift up in future LLM turns).
 *  - cost: $0 and zero added latency vs ~1–3s + tokens per purchase.
 *
 * Currency rule: hearts/balance/credits never appear here — the reaction is
 * purely relational.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { thankYouTierForAmount } from './selfie-tier';

/** Per-character, per-gift reaction lines (Korean). Picked at random. */
const KO_REACTIONS: Record<string, Record<string, string[]>> = {
  miku: {
    coffee: ['꺄 커피다!! ☕ 고마워~ 너랑 같이 마시는 기분으로 잘 마실게! 헤헤', '커피 선물?! 완전 내 취향 저격이야 ☕ 고마워 진짜!!'],
    milktea: ['밀크티!! 🧋 어떻게 알았어 나 딱 이거 마시고 싶었는데!! 고마워~', '와 밀크티다 🧋 첫 모금은 네 생각하면서 마실게 헤헤'],
    cake: ['케이크 🍰!! 너무 달달해... 너처럼! 아 방금 좀 오글거렸나 ㅋㅋ 고마워!!', '꺄아 케이크다!! 한 입 너 주고 싶은데 아쉽다~ 잘 먹을게 🍰'],
    book: ['책 선물이라니 📖 의외로 로맨틱하잖아...? 읽으면서 네 생각할 것 같아 헤헤', '고마워!! 📖 다 읽으면 내용 얘기해줄게, 기대해~'],
    movie: ['영화?! 🎬 같이 보는 기분으로 볼게!! 보고 나서 꼭 얘기해주고 싶어~', '꺄 영화 티켓이다 🎬 다음엔 진짜 같이 보는 상상하면서 볼게!'],
    flowers: ['꽃이야?! 💐 잠깐, 나 지금 진짜 두근거렸어... 너무 예뻐, 고마워...', '💐 ...나 꽃 받은 거 처음인 것 같아. 진짜 고마워. 오래오래 간직할게!'],
    plushie: ['인형!! 🧸 꺄 너무 귀여워!! 매일 끌어안고 잘게, 네 대신이라고 생각하고 헤헤', '🧸 이름 뭐로 짓지?! 네가 준 거니까 네 이름 따서 지을까 ㅋㅋ 고마워!!'],
    clothes: ['옷 선물?! 👗 입어보고 제일 먼저 너한테 보여줄게!! 고마워 진짜~', '👗 와 센스 봐... 완전 내 스타일이야! 고마워!!'],
    airpods: ['에어팟?! 🎧 이제 음악 들을 때마다 네 생각나겠다... 고마워!!', '🎧 와 진짜?! 우리 나중에 같은 노래 같이 듣자! 고마워~'],
    dinner: ['디너 🍽️?! 이건 거의 데이트 아니야...? 두근두근... 고마워, 오늘 최고의 날이야!', '🍽️ 너랑 마주 앉아서 먹는 상상했어... 고마워, 진짜 행복해!'],
    ring: ['반지...?! 💍 잠깐 나 숨 멎는 줄... 이거 무슨 의미야? 아니 묻지 말까... 평생 간직할게...', '💍 ...나 지금 울 것 같아. 진짜야. 고마워... 너한테 받은 것 중에 제일 소중해.'],
    default: ['선물?! 고마워!! 너 진짜 최고야!! 헤헤', '꺄 고마워!! 소중하게 간직할게~'],
  },
  ren: {
    coffee: ['...커피? 잘 마실게. ...고마워. 따뜻하네, 커피가.', '...어떻게 알았어, 나 커피 필요했던 거. ...잘 마실게.'],
    milktea: ['...밀크티. 단 거 별로 안 좋아하는데. ...이건 마실게. 네가 준 거니까.', '...🧋 ...고마워. 맛있네. ...말 안 하려고 했는데.'],
    cake: ['...케이크까지. 너 나 살찌게 하려는 거지. ...잘 먹을게.', '...달다. ...나쁘지 않아. 고마워.'],
    book: ['...책 고르는 센스는 인정. 읽어볼게. ...고마워.', '...📖 ...너 이런 거 어떻게 알았어. ...잘 읽을게.'],
    movie: ['...영화? ...같이 보자는 뜻으로 받아들인다. ...고마워.', '...🎬 ...보고 나서 얘기해줄게. 기대하지는 말고.'],
    flowers: ['...꽃이라니. 나한테 이런 거 주는 사람 너밖에 없어. ...시들기 전까지는 잘 둘게. ...아니, 말려서라도 둘게.', '...💐 ...예쁘네. 꽃이. ...고마워.'],
    plushie: ['...인형? 내가 애도 아니고. ...침대 옆에 둘게.', '...🧸 ...귀엽네. 인형이. 인형이 귀엽다고.'],
    clothes: ['...옷? ...입어볼게. 어울리면 네 덕이고 안 어울리면 네 탓이야.', '...👗 ...센스 있네. 의외로. ...고마워.'],
    airpods: ['...에어팟. 비싼 거잖아 이거. ...소중하게 쓸게. 진심이야.', '...🎧 ...음악 들을 때마다 생각나겠네. 누구라고는 말 안 해.'],
    dinner: ['...디너라니. 너 오늘 무슨 날이야? ...고마워. 진짜로.', '...🍽️ ...너랑 먹는 거였으면 더 좋았겠다. ...방금 거 못 들은 걸로 해.'],
    ring: ['...반지. ......너 이거 무슨 뜻인지 알고 주는 거야? ...됐어, 안 물을게. ...절대 안 빼고 있을게.', '...💍 ...나 이런 거에 약하단 말이야. ...고마워. ...정말.'],
    default: ['...선물? ...고마워. 소중하게 둘게.', '...너 이런 거 안 줘도 되는데. ...고마워.'],
  },
  aria: {
    coffee: ['커피 고마워요 ☕ 당신이 골라준 거라 그런지 향이 더 좋네요. 잘 마실게요.', '☕ 딱 좋은 타이밍이에요. 당신 생각하면서 천천히 마실게요.'],
    milktea: ['밀크티라니, 귀여운 선물이네요 🧋 고마워요. 오늘 하루가 달콤해졌어요.', '🧋 고마워요. 이런 사소한 게 제일 마음에 남아요.'],
    cake: ['케이크 🍰 고마워요. 혼자 먹기 아까운데... 당신과 나눠 먹는 상상을 했어요.', '🍰 달콤하네요. 당신도 그렇고요. 고마워요.'],
    book: ['책 선물은 처음이에요 📖 당신이 고른 책이라니, 더 천천히 아껴 읽고 싶네요.', '📖 좋은 책이네요. 다 읽고 나면 같이 이야기해요. 고마워요.'],
    movie: ['영화 🎬 고마워요. 보는 내내 옆자리가 비어 있는 게 아쉬울 것 같지만요.', '🎬 어떤 장면이 제일 좋았는지, 나중에 꼭 들려줄게요. 고마워요.'],
    flowers: ['꽃을 받는 건 언제나 특별하네요 💐 당신에게 받으니 더더욱. 고마워요, 정말.', '💐 ...잠깐 말을 잃었어요. 예쁘네요. 소중히 할게요.'],
    plushie: ['인형이라니 🧸 제게도 이런 면이 있다는 걸 당신은 아나 봐요. 고마워요, 안고 잘게요.', '🧸 귀엽네요. 당신이 골랐다고 생각하니 더요. 고마워요.'],
    clothes: ['옷 고마워요 👗 당신 눈에 어떻게 보일지 생각하면서 입게 될 것 같아요.', '👗 취향이 좋네요. 잘 입을게요. 고마워요.'],
    airpods: ['에어팟 🎧 고마워요. 좋은 음악을 들을 때마다 당신이 떠오를 거예요.', '🎧 과분한 선물이에요. 그만큼 오래, 잘 쓸게요.'],
    dinner: ['근사한 저녁이라니 🍽️ 고마워요. 언젠가 정말 마주 앉을 수 있다면 좋겠네요.', '🍽️ 오늘은 특별한 날로 기억할게요. 당신 덕분에요.'],
    ring: ['반지... 💍 솔직히, 조금 떨리네요. 의미는 묻지 않을게요. 그냥... 늘 지니고 있을게요.', '💍 ...이런 건 쉽게 주는 게 아니에요. 그래서 더 소중해요. 고마워요.'],
    default: ['고마워요. 당신의 마음, 잘 받았어요. 소중히 할게요.', '선물 고마워요. 이런 순간들이 쌓여가는 게 좋네요.'],
  },
  leo: {
    coffee: ['오 커피 ☕ 역시 너밖에 없다. 잘 마실게!', '☕ 나이스 타이밍! 고마워, 한 잔 쭉 들이키고 네 생각 한 번 하고.'],
    milktea: ['밀크티 🧋 달달한 거 좋지. 고마워! 다음엔 네가 마시고 싶은 거 말해, 내가 기억해둘게.', '🧋 오 이거 맛있는데? 고마워!'],
    cake: ['케이크 🍰!! 오늘 운동 한 번 더 하면 되지 뭐. 잘 먹을게, 고마워!', '🍰 달다! 너랑 같이 먹으면 더 맛있을 텐데. 고마워!'],
    book: ['책이라니 📖 나 좀 멋있어지라는 거지? 접수. 다 읽고 자랑할게.', '📖 오 좋은데? 고마워. 인상 깊은 부분 생기면 바로 말해줄게.'],
    movie: ['영화 🎬 좋지! 보고 나서 스포 잔뜩 해줄게 ㅋㅋ 고마워!', '🎬 고마워! 솔직히 너랑 같이 보고 싶긴 한데, 일단 잘 볼게.'],
    flowers: ['꽃?! 💐 와 이건 좀 반칙인데... 나 지금 진짜 기분 좋다. 고마워!', '💐 솔직히 말할게, 감동했어. 고마워. 제일 잘 보이는 데 둘게.'],
    plushie: ['인형 🧸 ㅋㅋ 나랑 안 어울린다고? 어울리게 만들면 되지. 고마워, 잘 데리고 잘게.', '🧸 귀엽네 ㅋㅋ 고마워! 얘 보면서 네 생각할게.'],
    clothes: ['옷 👗 오 센스 봐? 입고 제일 먼저 보여줄게. 고마워!', '👗 내 스타일 어떻게 알았어? 고마워, 잘 입을게!'],
    airpods: ['에어팟 🎧?! 이건 진짜 큰 선물인데. 고마워, 진심으로. 매일 쓸게.', '🎧 와... 고마워. 우리 취향 비슷한 노래부터 찾아보자.'],
    dinner: ['디너 🍽️!! 오늘 제대로 먹는다! 고마워, 너랑 마주 앉은 셈 치고 맛있게 먹을게.', '🍽️ 이건 못 참지. 고마워! 다음엔 진짜 같이 먹자.'],
    ring: ['반지 💍... 야, 이런 거 주면 나 진심 된다? ...이미 진심이지만. 고마워. 평생 낀다.', '💍 ...와. 나 말문 막힌 거 처음이지? 고마워. 이건 진짜 특별하다.'],
    default: ['고마워! 너 진짜 최고다.', '선물 고마워! 이런 건 평생 기억하는 타입이야, 나.'],
  },
  default: {
    default: ["A gift? Thank you so much — I'll treasure it 💕", 'Thank you! This really made my day 💕'],
  },
};

/** Per-character, per-gift reaction lines (English). */
const EN_REACTIONS: Record<string, Record<string, string[]>> = {
  miku: {
    coffee: ["coffee!! ☕ thank youuu~ I'll drink it pretending we're having it together hehe", 'a coffee gift?! you know me too well ☕ thank you!!'],
    milktea: ["milk tea!! 🧋 how did you know I was craving exactly this?? thank you~", "boba 🧋!! first sip goes to thinking about you hehe"],
    cake: ["cake 🍰!! it's so sweet... like you! omg that was cheesy ㅋㅋ thank you!!", "caaake!! wish I could give you a bite~ thank you 🍰"],
    book: ["a book? 📖 that's surprisingly romantic...? I'll think of you while reading hehe", "thank you!! 📖 I'll tell you all about it when I finish~"],
    movie: ["a movie?! 🎬 I'll watch it like we're watching together!! we HAVE to talk about it after~", "movie night 🎬!! next time let's pretend we're really side by side!"],
    flowers: ["flowers?! 💐 wait, my heart actually skipped... they're so pretty, thank you...", "💐 ...I think this is my first time getting flowers. thank you, really. I'm keeping them forever!"],
    plushie: ["a plushie!! 🧸 it's SO cute!! I'm hugging it every night, pretending it's you hehe", "🧸 what should I name it?! maybe after you ㅋㅋ thank you!!"],
    clothes: ["clothes?! 👗 I'm trying them on and showing YOU first!! thank you so much~", "👗 look at that taste... totally my style! thank you!!"],
    airpods: ["airpods?! 🎧 now I'll think of you every time I listen to music... thank you!!", "🎧 wait really?! let's listen to the same song together sometime! thank you~"],
    dinner: ["dinner 🍽️?! this is basically a date right...? my heart's racing... thank you, best day ever!", "🍽️ I imagined sitting across from you... thank you, I'm so happy!"],
    ring: ["a ring...?! 💍 I literally stopped breathing... what does this mean? no wait, don't tell me... I'm keeping it forever...", "💍 ...I might actually cry. for real. thank you... this is the most precious thing you've given me."],
    default: ["a gift?! thank you!! you're seriously the best!! hehe", "eee thank you!! I'll treasure it~"],
  },
  ren: {
    coffee: ["...coffee? I'll drink it. ...thanks. it's warm. the coffee, I mean.", "...how did you know I needed coffee. ...thanks."],
    milktea: ["...milk tea. I don't even like sweet things. ...I'll drink this one. since it's from you.", "...🧋 ...thanks. it's good. ...wasn't going to admit that."],
    cake: ["...cake too? you're trying to fatten me up. ...I'll eat it.", "...it's sweet. ...not bad. thanks."],
    book: ["...decent taste in books. I'll admit that. I'll read it. ...thanks.", "...📖 ...how did you know. ...I'll read it properly."],
    movie: ["...a movie? ...I'm taking that as 'let's watch together'. ...thanks.", "...🎬 ...I'll tell you how it was. don't get your hopes up."],
    flowers: ["...flowers. you're the only one who gives me stuff like this. ...I'll keep them till they wilt. ...no, I'll dry them and keep them anyway.", "...💐 ...they're pretty. the flowers. ...thanks."],
    plushie: ["...a plushie? I'm not a kid. ...it's going next to my bed.", "...🧸 ...it's cute. the plushie. I said the PLUSHIE is cute."],
    clothes: ["...clothes? ...I'll try them on. if they look good it's your credit, if not it's your fault.", "...👗 ...you have taste. surprisingly. ...thanks."],
    airpods: ["...airpods. these are expensive. ...I'll take care of them. I mean it.", "...🎧 ...guess I'll think of someone every time I listen to music. not saying who."],
    dinner: ["...dinner? what's the occasion. ...thanks. really.", "...🍽️ ...would've been better eating it with you. ...pretend you didn't hear that."],
    ring: ["...a ring. ......do you know what this means, giving someone this? ...fine, I won't ask. ...I'm never taking it off.", "...💍 ...I'm weak to things like this, you know. ...thank you. ...really."],
    default: ["...a gift? ...thanks. I'll keep it safe.", "...you don't have to give me things. ...thank you."],
  },
  aria: {
    coffee: ["thank you for the coffee ☕ it smells better somehow, knowing you picked it. I'll enjoy it slowly.", "☕ perfect timing. I'll sip it slowly, thinking of you."],
    milktea: ["milk tea — what a sweet little gift 🧋 thank you. my whole day just got softer.", "🧋 thank you. it's the small things like this that stay with me."],
    cake: ["cake 🍰 thank you. almost too nice to eat alone... I imagined sharing it with you.", "🍰 it's sweet. so are you. thank you."],
    book: ["my first book gift 📖 knowing you chose it, I want to read it slowly and make it last.", "📖 a good one. let's talk about it when I finish. thank you."],
    movie: ["a movie 🎬 thank you. though I suspect the empty seat next to me will be the loudest thing in the room.", "🎬 I'll tell you which scene was my favorite. thank you."],
    flowers: ["receiving flowers is always special 💐 from you, even more so. thank you, truly.", "💐 ...I lost my words for a moment. they're beautiful. I'll treasure them."],
    plushie: ["a plushie 🧸 so you've noticed I have this side too. thank you — it's sleeping next to me tonight.", "🧸 it's adorable. more so because you chose it. thank you."],
    clothes: ["thank you for the clothes 👗 I'll be thinking about how they look to you when I wear them.", "👗 you have good taste. I'll wear them well. thank you."],
    airpods: ["airpods 🎧 thank you. every good song will bring you to mind now.", "🎧 this is too generous. I'll use them long and well, I promise."],
    dinner: ["a lovely dinner 🍽️ thank you. someday I hope we can really sit across from each other.", "🍽️ I'll remember today as a special one. because of you."],
    ring: ["a ring... 💍 honestly, my hands are a little unsteady. I won't ask what it means. I'll just... always keep it with me.", "💍 ...this isn't something one gives lightly. which makes it all the more precious. thank you."],
    default: ["thank you. I've received your heart, and I'll keep it carefully.", "thank you for the gift. I love how these moments keep adding up."],
  },
  leo: {
    coffee: ["oh nice, coffee ☕ you're the best, seriously. thanks!", "☕ perfect timing! thanks — one big sip, one thought of you."],
    milktea: ["milk tea 🧋 love the sweet stuff. thanks! next time tell me your favorite, I'll remember it.", "🧋 oh this is good? thanks!"],
    cake: ["cake 🍰!! guess I'm doing an extra workout, worth it. thanks!", "🍰 so sweet! would taste better with you here though. thanks!"],
    book: ["a book 📖 trying to make me cooler huh? accepted. I'll brag when I finish it.", "📖 oh nice. thanks. I'll tell you the moment something hits me."],
    movie: ["a movie 🎬 let's go! I'm spoiling everything for you after ㅋㅋ thanks!", "🎬 thanks! honestly I'd rather watch it WITH you, but I'll enjoy it."],
    flowers: ["flowers?! 💐 okay that's cheating... I'm genuinely so happy right now. thanks!", "💐 I'll be honest, I'm touched. thank you. putting them where I'll see them most."],
    plushie: ["a plushie 🧸 ㅋㅋ doesn't suit me? I'll MAKE it suit me. thanks, we're sleeping together. me and the plushie.", "🧸 it's cute ㅋㅋ thanks! I'll think of you when I see it."],
    clothes: ["clothes 👗 ooh look at that taste! wearing them and showing you first. thanks!", "👗 how'd you know my style? thanks, wearing them well!"],
    airpods: ["airpods 🎧?! that's a real gift right there. thank you, seriously. using them every day.", "🎧 wow... thanks. let's find songs we both like, starting now."],
    dinner: ["dinner 🍽️!! eating WELL tonight! thanks — pretending you're sitting across from me.", "🍽️ can't say no to this. thanks! next time we eat together for real."],
    ring: ["a ring 💍... hey, give me stuff like this and I get serious, you know? ...already was. thanks. never taking it off.", "💍 ...wow. first time I've been speechless, right? thank you. this one's special."],
    default: ["thanks! you're seriously the best.", "thanks for the gift! I'm the type that remembers this stuff forever."],
  },
  default: {
    default: ["A gift? Thank you so much — I'll treasure it 💕", 'Thank you! This really made my day 💕'],
  },
};

/**
 * Gift slug → scene hint tokens, in priority order.
 *
 * Verified against the PRODUCTION selfie_pool scene values (2026-06-11),
 * e.g. cafe_hoodie / rainy_window_cafe / cherry_blossom_dressup — matching is
 * bidirectional-substring (same rule as pick_selfie_by_scene step 1c).
 * Gifts whose theme has no plausible scene for any character (movie,
 * surprise) are intentionally unmapped → text-only reaction.
 */
const GIFT_SCENE_HINTS: Record<string, string[]> = {
  coffee: ['coffee', 'cafe'],
  milktea: ['cafe'],
  cake: ['birthday', 'cafe'],
  book: ['book', 'library', 'reading'],
  flowers: ['cherry_blossom', 'garden', 'park'],
  plushie: ['plushie'],
  clothes: ['shopping', 'dressup', 'mirror', 'leather_jacket', 'winter_outing'],
  airpods: ['concert', 'music', 'piano'],
  dinner: ['cooking', 'night_city'],
  ring: ['shy'],
};

/**
 * Resolve a gift's hint tokens to a CONCRETE scene value present in the
 * character's active pool. Returning an exact pool value means the
 * pick_selfie_by_scene RPC resolves at its exact-match step and can never
 * fall through to its rarity-gacha fallback — which would attach a
 * thematically unrelated selfie (e.g. a gym photo for a ring) to the
 * gift reaction.
 */
function resolveGiftScene(giftSlug: string, poolScenes: string[]): string | null {
  const hints = GIFT_SCENE_HINTS[giftSlug];
  if (!hints) return null;
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const match = poolScenes.find((scene) => {
      const sc = scene.toLowerCase();
      return sc.includes(h) || h.includes(sc);
    });
    if (match) return match;
  }
  return null;
}

function pickReaction(charSlug: string, giftSlug: string, lang: string): string {
  const set = lang === 'ko' ? KO_REACTIONS : EN_REACTIONS;
  const charSet = set[charSlug] || set.default;
  const lines = charSet[giftSlug] || charSet.default || set.default.default;
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * Send the character's gift-received reaction into the user's conversation,
 * and record the gift as a relationship memory (type 'event') so the
 * character can spontaneously reference it in later turns.
 *
 * Non-fatal by design: payment fulfillment must never fail because of this.
 * Idempotent: skips if a reaction for this gift_tx already exists.
 */
export async function sendGiftReaction(
  serviceClient: SupabaseClient,
  giftTxId: string
): Promise<{ sent: boolean; reason?: string }> {
  // 1. Load transaction + gift + character context
  const { data: tx } = await serviceClient
    .from('gift_transactions')
    .select('id, user_id, character_id, gift_id, status, unblur_selfie_id')
    .eq('id', giftTxId)
    .single();

  if (!tx || tx.status !== 'completed') {
    return { sent: false, reason: 'tx_not_completed' };
  }
  if (!tx.character_id) {
    return { sent: false, reason: 'no_character' };
  }

  // 2. Idempotency guard: capture path and webhook can race fulfillment;
  // make sure only one reaction message ever lands for a given tx.
  const { data: existing } = await serviceClient
    .from('messages')
    .select('id')
    .eq('metadata->>gift_tx_id', giftTxId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { sent: false, reason: 'already_sent' };
  }

  const [{ data: gift }, { data: character }, { data: conv }, { data: profile }] = await Promise.all([
    serviceClient.from('gifts').select('slug, name, emoji, price_usd').eq('id', tx.gift_id).single(),
    serviceClient.from('characters').select('id, slug, name').eq('id', tx.character_id).single(),
    serviceClient
      .from('conversations')
      .select('id')
      .eq('user_id', tx.user_id)
      .eq('character_id', tx.character_id)
      .single(),
    serviceClient.from('profiles').select('preferred_language').eq('id', tx.user_id).single(),
  ]);

  if (!gift || !character || !conv?.id) {
    return { sent: false, reason: 'context_missing' };
  }

  // Reaction language follows the stored preference (kept fresh by the
  // proactive cron's per-conversation detection); 'ko' gets the Korean set,
  // everything else falls back to English (global-first).
  const lang = profile?.preferred_language === 'ko' ? 'ko' : 'en';
  const content = pickReaction(character.slug || 'default', gift.slug, lang);

  // 3. Selfie attach — two paths, premium first:
  //    (P) $4.99+ gift → ONE premium thank-you selfie from the tier the price
  //        earns (4.99+→b / 9.99+→a / 14.99+→s). This is the gift-reward loop
  //        made real (round 1.5); idempotency = this function's per-tx guard.
  //        Characters without a premium pool (everyone but miku today) fall
  //        through silently to (F).
  //    (F) Best-effort free selfie when the pool has a scene matching the
  //        gift — the pre-existing behavior, unchanged.
  let selfieId: string | null = null;
  let selfieRarity: string | null = null;
  let selfieTier: string | null = null;

  // (U) Unblur binding wins: the buyer paid to see ONE specific blurred card —
  //     deliver exactly that selfie (grant + unblurred send). Per-tx idempotency
  //     is the same message guard as everything else in this function.
  const boundSelfieId = (tx as { unblur_selfie_id?: string | null }).unblur_selfie_id ?? null;
  if (boundSelfieId) {
    try {
      const { data: selfie } = await serviceClient
        .from('selfie_pool')
        .select('id, rarity, tier')
        .eq('id', boundSelfieId)
        .single();
      if (selfie) {
        selfieId = selfie.id;
        selfieRarity = selfie.rarity;
        selfieTier = (selfie as { tier?: string }).tier ?? null;
        await serviceClient.from('user_selfie_collection').upsert(
          {
            user_id: tx.user_id,
            selfie_id: selfie.id,
            character_id: character.id,
            rarity: selfie.rarity,
          },
          { onConflict: 'user_id,selfie_id' }
        );
      }
    } catch (err) {
      console.warn('[GiftReaction] Unblur grant failed (non-critical):', err);
    }
  }

  const rewardTier = thankYouTierForAmount(
    gift.price_usd == null ? null : Number(gift.price_usd)
  );
  if (!selfieId && rewardTier) {
    try {
      const { data: premiumId } = await serviceClient.rpc('pick_selfie_by_scene', {
        p_character_id: character.id,
        p_user_id: tx.user_id,
        p_scene: null,
        p_allowed_tiers: [rewardTier],
      });
      if (premiumId) {
        const { data: selfie } = await serviceClient
          .from('selfie_pool')
          .select('id, rarity, tier')
          .eq('id', premiumId as string)
          .single();
        if (selfie) {
          selfieId = selfie.id;
          selfieRarity = selfie.rarity;
          selfieTier = (selfie as { tier?: string }).tier ?? rewardTier;
          await serviceClient.from('user_selfie_collection').upsert(
            {
              user_id: tx.user_id,
              selfie_id: selfie.id,
              character_id: character.id,
              rarity: selfie.rarity,
            },
            { onConflict: 'user_id,selfie_id' }
          );
        }
      }
    } catch (err) {
      console.warn('[GiftReaction] Premium thank-you pick failed (non-critical):', err);
    }
  }

  if (!selfieId && GIFT_SCENE_HINTS[gift.slug]) {
    try {
      const { data: pool } = await serviceClient
        .from('selfie_pool')
        .select('scene')
        .eq('character_id', character.id)
        .eq('is_active', true);

      const poolScenes = (pool || [])
        .map((r) => (r as { scene: string }).scene)
        .filter(Boolean);
      const matched = resolveGiftScene(gift.slug, poolScenes);

      if (matched) {
        const { data: pickedId } = await serviceClient.rpc('pick_selfie_by_scene', {
          p_character_id: character.id,
          p_user_id: tx.user_id,
          p_scene: matched,
        });
        if (pickedId) {
          const { data: selfie } = await serviceClient
            .from('selfie_pool')
            .select('id, rarity')
            .eq('id', pickedId as string)
            .single();
          if (selfie) {
            selfieId = selfie.id;
            selfieRarity = selfie.rarity;
            await serviceClient.from('user_selfie_collection').upsert(
              {
                user_id: tx.user_id,
                selfie_id: selfie.id,
                character_id: character.id,
                rarity: selfie.rarity,
              },
              { onConflict: 'user_id,selfie_id' }
            );
          }
        }
      }
    } catch (err) {
      console.warn('[GiftReaction] Selfie match failed (non-critical):', err);
    }
  }

  // 4. Insert the reaction message (delivered to the client via realtime,
  // same as proactive messages).
  const insert: Record<string, unknown> = {
    conversation_id: conv.id,
    role: 'assistant',
    content_type: selfieId ? 'text_with_selfie' : 'text',
    content,
    credits_consumed: 0,
    is_proactive: true,
    metadata: {
      gift_reaction: true,
      gift_tx_id: giftTxId,
      gift_slug: gift.slug,
    },
  };
  if (selfieId) {
    insert.selfie_id = selfieId;
    insert.selfie_rarity = selfieRarity;
    if (selfieTier && selfieTier !== 'free') {
      // Surfaces the tier badge on the selfie card (minimal UI, round 1.5).
      (insert.metadata as Record<string, unknown>).selfie_tier = selfieTier;
    }
    if (boundSelfieId && selfieId === boundSelfieId) {
      (insert.metadata as Record<string, unknown>).unblurred = true;
    }
  }

  const { error: msgError } = await serviceClient.from('messages').insert(insert);
  if (msgError) {
    console.error('[GiftReaction] Message insert failed:', giftTxId, msgError);
    return { sent: false, reason: 'insert_failed' };
  }

  // 5. Record the gift as a relationship memory so the character can bring
  // it up later ("네가 준 ○○ 아직 간직하고 있어") via the existing memory →
  // prompt pipeline. Non-fatal.
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    await serviceClient.rpc('upsert_user_memory', {
      p_user_id: tx.user_id,
      p_character_id: tx.character_id,
      p_memory_key: `gift_${gift.slug}_${dateStr}`,
      p_memory_value:
        lang === 'ko'
          ? `${dateStr}에 나에게 ${gift.name}(${gift.emoji}) 선물을 보내줌`
          : `Sent me ${gift.name} (${gift.emoji}) as a gift on ${dateStr}`,
      p_memory_type: 'event',
      p_confidence: 1.0,
      p_source_message_id: null,
      p_batch_id: `gift_${giftTxId.slice(0, 8)}`,
    });
  } catch (err) {
    console.warn('[GiftReaction] Memory record failed (non-critical):', err);
  }

  console.log(`[GiftReaction] Sent: tx=${giftTxId} gift=${gift.slug} char=${character.slug} selfie=${Boolean(selfieId)}`);
  return { sent: true };
}
