/**
 * Feedback notification email.
 *
 * Sends a notification to the internal inbox when new feedback arrives, using
 * the Resend REST API directly (no SDK dependency). Designed to be best-effort:
 * if env keys are missing or the call fails, it never throws — feedback is
 * already persisted in Supabase, which is the source of truth. Email is a
 * convenience layer on top.
 */

interface FeedbackEmailInput {
  id: string;
  category: string;
  message: string;
  contactEmail: string | null;
  userId: string | null;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Escape for safe inclusion in HTML email body. */
function esc(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c] || c);
}

export async function sendFeedbackNotification(input: FeedbackEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_NOTIFY_TO;
  const from = process.env.FEEDBACK_NOTIFY_FROM;

  // Notification is optional infra. No keys -> Supabase-only operation.
  if (!apiKey || !to || !from) {
    return;
  }

  const subject = `[VegaMate feedback] ${input.category} — ${input.id.slice(0, 8)}`;
  const html = [
    `<h2>New feedback (${esc(input.category)})</h2>`,
    `<p><strong>Message</strong></p>`,
    `<p style="white-space:pre-wrap">${esc(input.message)}</p>`,
    `<hr/>`,
    `<p><strong>Contact:</strong> ${input.contactEmail ? esc(input.contactEmail) : '(none)'}</p>`,
    `<p><strong>User ID:</strong> ${input.userId ? esc(input.userId) : '(anonymous)'}</p>`,
    `<p><strong>Feedback ID:</strong> ${esc(input.id)}</p>`,
  ].join('');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        // Lets you hit "reply" and reach the user directly when they left an email.
        ...(input.contactEmail ? { reply_to: input.contactEmail } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[Feedback Email] non-OK response', res.status, detail.slice(0, 300));
    }
  } catch (err) {
    // Swallow: feedback already saved. Don't let email failure break the request.
    console.error('[Feedback Email] send failed', err instanceof Error ? err.message : err);
  }
}
