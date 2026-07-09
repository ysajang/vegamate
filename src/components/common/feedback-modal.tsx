'use client';

import { useCallback, useEffect, useState } from 'react';

type Category = 'general' | 'payment' | 'bug' | 'other';

const SUPPORT_EMAIL = 'support@vegamate.com';

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'payment', label: 'Payment' },
  { value: 'bug', label: 'Bug' },
  { value: 'other', label: 'Other' },
];

const MAX_LEN = 5000;

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  /** Preselected category (e.g. 'payment' from the payment error screen). */
  defaultCategory?: Category;
  /** Logged-in user's email, shown so they know which address we'll see. */
  defaultEmail?: string | null;
}

/** Build a mailto: URL with the form contents prefilled into subject + body. */
function buildMailto(category: Category, message: string, fromEmail: string): string {
  const subject = `VegaMate feedback — ${category}`;
  const bodyLines = [
    message,
    '',
    '---',
    fromEmail ? `From: ${fromEmail}` : '',
  ].filter(Boolean);
  const params = new URLSearchParams({
    subject,
    body: bodyLines.join('\n'),
  });
  // URLSearchParams encodes spaces as '+', which some mail clients keep literally.
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${SUPPORT_EMAIL}?${qs}`;
}

export function FeedbackModal({
  open,
  onClose,
  defaultCategory = 'general',
  defaultEmail = null,
}: FeedbackModalProps) {
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [wasOpen, setWasOpen] = useState(open);

  // Re-sync presets on the open transition (render-phase, no effect cascade).
  if (open && !wasOpen) {
    setWasOpen(true);
    setCategory(defaultCategory);
    setMessage('');
    setStatus('idle');
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // In-app submit. The old mailto: flow silently failed for PWA users without
  // a configured mail client (the common case on mobile installs); mailto is
  // kept only as the on-error fallback below.
  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed,
          context: {
            path: typeof window !== 'undefined' ? window.location.pathname : null,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
      setTimeout(onClose, 1200);
    } catch {
      setStatus('error');
    }
  }, [category, message, status, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet / dialog */}
      <div
        className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-t-2xl border p-5 sm:rounded-2xl"
        style={{
          background: 'var(--vm-card)',
          borderColor: 'var(--vm-glass-border)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-bold" style={{ color: 'var(--vm-text-primary)' }}>
              Send feedback
            </h2>
            <p className="text-xs" style={{ color: 'var(--vm-text-tertiary)' }}>
              Tell us what&apos;s working or what isn&apos;t. We read every message.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none opacity-50 transition-opacity hover:opacity-100"
            style={{ color: 'var(--vm-text-secondary)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Category */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((opt) => {
            const active = category === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--vm-purple)' : 'var(--vm-glass-border)',
                  background: active ? 'var(--vm-purple)' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--vm-text-secondary)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Message */}
        <div className="flex flex-col gap-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
            rows={4}
            placeholder="What happened? The more detail, the better."
            className="w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none transition-colors focus:ring-1"
            style={{
              borderColor: 'var(--vm-glass-border)',
              background: 'var(--vm-elevated)',
              color: 'var(--vm-text-primary)',
            }}
          />
          <span className="self-end text-[10px]" style={{ color: 'var(--vm-text-tertiary)' }}>
            {message.length}/{MAX_LEN}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!message.trim() || status === 'sending' || status === 'sent'}
          className="h-11 w-full rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: status === 'sent' ? 'var(--vm-success, #22c55e)' : 'var(--vm-purple)' }}
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent — thank you! 💜' : 'Send feedback'}
        </button>

        {status === 'error' ? (
          <p className="text-center text-[11px]" style={{ color: 'var(--vm-text-tertiary)' }}>
            Couldn&apos;t send right now — please try again, or email us at{' '}
            <a
              href={buildMailto(category, message.trim(), defaultEmail ?? '')}
              className="font-medium underline underline-offset-2"
              style={{ color: 'var(--vm-purple-soft)' }}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        ) : (
          <p className="text-center text-[11px]" style={{ color: 'var(--vm-text-tertiary)' }}>
            Goes straight to the team. We read every message.
          </p>
        )}
      </div>
    </div>
  );
}
