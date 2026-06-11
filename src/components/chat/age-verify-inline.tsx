'use client';

import { useState } from 'react';

/**
 * Inline 생년월일 인증 form, used when an already-onboarded user hits the
 * age gate at a paid surface (their profile predates the onboarding age step).
 *
 * The server (/api/profile/age) is the sole authority on adulthood; this form
 * only collects the DOB and reports the server's verdict upward.
 */
export function AgeVerifyInline({
  onVerified,
  onMinor,
}: {
  /** Server confirmed 만 19세+. */
  onVerified: () => void;
  /** Server confirmed minor — caller should stop the paid flow. */
  onMinor: () => void;
}) {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canProceed = year.length === 4 && month.length >= 1 && day.length >= 1 && !submitting;

  async function handleSubmit() {
    if (!canProceed) return;
    setError(null);

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      setError('Please double-check your birth date.');
      return;
    }

    const birthDate = `${y.toString().padStart(4, '0')}-${m
      .toString()
      .padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

    setSubmitting(true);
    try {
      const res = await fetch('/api/profile/age', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth_date: birthDate }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || 'Verification failed. Please try again.');
        setSubmitting(false);
        return;
      }

      if (json.data?.age_verified_adult) {
        onVerified();
      } else {
        onMinor();
      }
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  const inputStyle = {
    color: 'var(--vm-text-primary)',
    borderBottom: '1.5px solid rgba(255,255,255,0.15)',
  } as const;

  return (
    <div className="mt-3">
      <p className="text-[12px]" style={{ color: 'var(--vm-text-secondary)' }}>
        A quick one-time age check (19+) is required before purchase.
      </p>
      <div className="mt-2 flex items-end gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="YYYY"
          className="w-[64px] bg-transparent py-1.5 text-center text-[15px] outline-none"
          style={inputStyle}
        />
        <span className="pb-1.5 text-[13px]" style={{ color: 'var(--vm-text-tertiary)' }}>/</span>
        <input
          type="text"
          inputMode="numeric"
          value={month}
          onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="MM"
          className="w-[44px] bg-transparent py-1.5 text-center text-[15px] outline-none"
          style={inputStyle}
        />
        <span className="pb-1.5 text-[13px]" style={{ color: 'var(--vm-text-tertiary)' }}>/</span>
        <input
          type="text"
          inputMode="numeric"
          value={day}
          onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canProceed) handleSubmit();
          }}
          placeholder="DD"
          className="w-[44px] bg-transparent py-1.5 text-center text-[15px] outline-none"
          style={inputStyle}
        />
        <button
          onClick={canProceed ? handleSubmit : undefined}
          className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
          style={{
            background: canProceed ? 'var(--vm-purple-deep)' : 'rgba(255,255,255,0.06)',
            color: canProceed ? '#FFF' : 'var(--vm-text-tertiary)',
            cursor: canProceed ? 'pointer' : 'default',
          }}
        >
          {submitting ? '확인 중' : '인증'}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--vm-rose)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
