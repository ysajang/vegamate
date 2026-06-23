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
  const [wasOpen, setWasOpen] = useState(open);

  // Re-sync presets on the open transition (render-phase, no effect cascade).
  if (open && !wasOpen) {
    setWasOpen(true);
    setCategory(defaultCategory);
    setMessage('');
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

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    // Opens the user's default mail app with everything prefilled.
    // They just hit send; the mail lands in our support inbox.
    window.location.href = buildMailto(category, trimmed, defaultEmail ?? '');
    onClose();
  }, [category, message, defaultEmail, onClose]);

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
          disabled={!message.trim()}
          className="h-11 w-full rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'var(--vm-purple)' }}
        >
          Send feedback
        </button>

        {/* Fallback: show the address so users on clients without a mail app can copy it. */}
        <p className="text-center text-[11px]" style={{ color: 'var(--vm-text-tertiary)' }}>
          Or email us directly at{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium underline underline-offset-2"
            style={{ color: 'var(--vm-purple-soft)' }}
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
