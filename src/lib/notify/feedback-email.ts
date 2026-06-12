/**
 * Feedback notification email — Cloudflare Email Sending REST API.
 *
 * Free path: sending to a *verified destination address* (the address already
 * registered + verified in Cloudflare Email Routing) costs nothing on any plan
 * and works with only Email Routing configured. So FEEDBACK_NOTIFY_TO must be
 * the verified personal inbox, NOT the routed alias (support@vegamate.com).
 *
 * Best-effort by design: if env keys are missing or the call fails, it never
 * throws — feedback is already persisted in Supabase (source of truth).
 */

interface FeedbackEmailInput {
  id: string;
  category: string;
  message: string;
  contactEmail: string | null;
  userId: string | null;
}

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
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_EMAIL_API_TOKEN; // permission: Email Sending: Edit
  const to = process.env.FEEDBACK_NOTIFY_TO; // verified destination address (personal inbox)
  const from = process.env.FEEDBACK_NOTIFY_FROM; // address on the routed domain, e.g. noreply@vegamate.com

  // Notification is optional infra. No keys -> Supabase-only operation.
  if (!accountId || !apiToken || !to || !from) {
    return;
  }

  const subject = `[VegaMate feedback] ${input.category} — ${input.id.slice(0, 8)}`;
  const text = [
    `New feedback (${input.category})`,
    '',
    input.message,
    '',
    '---',
    `Contact: ${input.contactEmail ?? '(none)'}`,
    `User ID: ${input.userId ?? '(anonymous)'}`,
    `Feedback ID: ${input.id}`,
  ].join('\n');
  const html = [
    `<h2>New feedback (${esc(input.category)})</h2>`,
    `<p style="white-space:pre-wrap">${esc(input.message)}</p>`,
    `<hr/>`,
    `<p><strong>Contact:</strong> ${input.contactEmail ? esc(input.contactEmail) : '(none)'}</p>`,
    `<p><strong>User ID:</strong> ${input.userId ? esc(input.userId) : '(anonymous)'}</p>`,
    `<p><strong>Feedback ID:</strong> ${esc(input.id)}</p>`,
  ].join('');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          from: { address: from, name: 'VegaMate Feedback' },
          subject,
          html,
          text,
          // Reply lands directly in the user's inbox when they left an email.
          ...(input.contactEmail ? { reply_to: input.contactEmail } : {}),
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[Feedback Email] CF non-OK response', res.status, detail.slice(0, 300));
    }
  } catch (err) {
    // Swallow: feedback already saved. Don't let email failure break the request.
    console.error('[Feedback Email] send failed', err instanceof Error ? err.message : err);
  }
}
