'use client';

import { useState } from 'react';
import { FeedbackModal } from './feedback-modal';

type Category = 'general' | 'payment' | 'bug' | 'other';

interface FeedbackTriggerProps {
  /** Logged-in user's email to prefill. */
  defaultEmail?: string | null;
  defaultCategory?: Category;
  /** Visual style: settings row vs inline link. */
  variant?: 'row' | 'link';
  label?: string;
}

export function FeedbackTrigger({
  defaultEmail = null,
  defaultCategory = 'general',
  variant = 'row',
  label = 'Send feedback',
}: FeedbackTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'row' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            background: 'var(--vm-card)',
            color: 'var(--vm-text-primary)',
          }}
        >
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs opacity-40">›</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium underline underline-offset-4 transition-opacity hover:opacity-80"
          style={{ color: 'var(--vm-purple-soft)' }}
        >
          {label}
        </button>
      )}

      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        defaultEmail={defaultEmail}
        defaultCategory={defaultCategory}
      />
    </>
  );
}
