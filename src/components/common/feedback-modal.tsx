'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Category = 'general' | 'payment' | 'bug' | 'other';
type FormState = 'idle' | 'submitting';

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
  /** Logged-in user's email, prefilled into the contact field. */
  defaultEmail?: string | null;
}

export function FeedbackModal({
  open,
  onClose,
  defaultCategory = 'general',
  defaultEmail = null,
}: FeedbackModalProps) {
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [state, setState] = useState<FormState>('idle');
  const [wasOpen, setWasOpen] = useState(open);

  // Re-sync presets on the open transition (render-phase, no effect cascade).
  if (open && !wasOpen) {
    setWasOpen(true);
    setCategory(defaultCategory);
    setEmail(defaultEmail ?? '');
    setMessage('');
    setState('idle');
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

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Please enter a message');
      return;
    }

    setState('submitting');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed,
          contact_email: email.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Something went wrong');
        setState('idle');
        return;
      }

      // Single short thank-you. No modal chain.
      toast.success('Thanks — we got your feedback 💜');
      onClose();
    } catch {
      toast.error('Network error. Please try again.');
      setState('idle');
    }
  }, [category, message, email, onClose]);

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
            disabled={state === 'submitting'}
            rows={4}
            placeholder="What happened? The more detail, the better."
            className="w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none transition-colors focus:ring-1 disabled:opacity-50"
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

        {/* Contact email (optional) */}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === 'submitting'}
          placeholder="Email (optional — so we can reply)"
          className="h-11 w-full rounded-xl border px-3.5 text-sm outline-none transition-colors focus:ring-1 disabled:opacity-50"
          style={{
            borderColor: 'var(--vm-glass-border)',
            background: 'var(--vm-elevated)',
            color: 'var(--vm-text-primary)',
          }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={state === 'submitting' || !message.trim()}
          className="h-11 w-full rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'var(--vm-purple)' }}
        >
          {state === 'submitting' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Sending...
            </span>
          ) : (
            'Send feedback'
          )}
        </button>
      </div>
    </div>
  );
}
