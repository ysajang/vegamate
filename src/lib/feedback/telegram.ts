/**
 * Fire-and-forget Telegram notification for new feedback.
 *
 * Env (Vercel): TELEGRAM_BOT_TOKEN + TELEGRAM_FEEDBACK_CHAT_ID.
 * When either is missing the notifier silently no-ops — feedback still lands
 * in the DB, so the channel degrades gracefully instead of failing the API.
 * Never throws; a Telegram outage must not break feedback submission.
 */

export interface FeedbackNotification {
  category: string;
  message: string;
  userEmail: string | null;
  userId: string;
  path?: string | null;
}

export async function notifyFeedbackTelegram(n: FeedbackNotification): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID;
  if (!token || !chatId) return;

  // Plain text (no parse_mode) — user-generated content must not be able to
  // break Markdown/HTML parsing or inject formatting.
  const text = [
    `📮 VegaMate feedback [${n.category}]`,
    n.message.length > 1000 ? `${n.message.slice(0, 1000)}…` : n.message,
    '—',
    `from: ${n.userEmail ?? 'unknown'} (${n.userId.slice(0, 8)})`,
    n.path ? `at: ${n.path}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      // Feedback API latency must not hang on Telegram.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn('[Feedback] Telegram notify failed:', res.status);
    }
  } catch (err) {
    console.warn('[Feedback] Telegram notify error:', err);
  }
}
