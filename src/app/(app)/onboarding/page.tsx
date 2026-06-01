'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { CharacterAvatar, TypingIndicator } from '@/components/common';
import type { DbCharacter } from '@/types';

/** Map character slug to accent color */
function getAccentColor(slug: string): string {
  if (slug === 'ren') return 'var(--vm-cool)';
  return 'var(--vm-rose)';
}

function getPhotoBg(slug: string): string {
  if (slug === 'ren') return '#0F1520';
  return '#2D1B35';
}

// ── Step Bar ────────────────────────────────────────────────
function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 px-6 pt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 rounded-full transition-colors duration-300"
          style={{
            background: i <= current ? 'var(--vm-purple)' : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  );
}

// ── Step 1: Name ────────────────────────────────────────────
function StepName({
  name,
  setName,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  const canProceed = name.trim().length > 0;

  return (
    <div className="vm-animate-fade-in-up flex flex-1 flex-col justify-center gap-8 px-8">
      <div className="text-center">
        <h1
          className="text-[26px] font-bold"
          style={{ color: 'var(--vm-text-primary)', letterSpacing: '-0.02em' }}
        >
          What should I call you?
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--vm-text-tertiary)' }}>
          your companion wants to know
        </p>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canProceed) onNext();
        }}
        placeholder="your name"
        autoFocus
        className="w-full bg-transparent py-4 text-center text-2xl font-medium outline-none transition-colors duration-200"
        style={{
          color: 'var(--vm-text-primary)',
          borderBottom: `2px solid ${canProceed ? 'var(--vm-purple)' : 'rgba(255,255,255,0.1)'}`,
          letterSpacing: '-0.01em',
        }}
        maxLength={20}
      />

      <button
        onClick={canProceed ? onNext : undefined}
        className="w-full rounded-2xl py-4 text-[16px] font-semibold transition-all duration-200"
        style={{
          background: canProceed ? 'var(--vm-purple-deep)' : 'rgba(255,255,255,0.04)',
          color: canProceed ? '#FFF' : 'var(--vm-text-tertiary)',
          cursor: canProceed ? 'pointer' : 'default',
        }}
      >
        Next
      </button>
    </div>
  );
}

// ── Step: Age Gate (생년월일 인증) ──────────────────────────
// KR 만 19세 이상만 진입 가능. 서버가 만 나이를 재계산하므로
// 여기서의 클라 검증은 UX(즉시 피드백)일 뿐, 권위는 서버에 있다.
function StepAge({
  onVerified,
  onMinor,
}: {
  onVerified: () => void;
  onMinor: () => void;
}) {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canProceed =
    year.length === 4 && month.length >= 1 && day.length >= 1 && !submitting;

  async function handleSubmit() {
    if (!canProceed) return;
    setError(null);

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    // Light client-side sanity (server re-validates authoritatively).
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
      setError('숫자만 입력해 주세요.');
      return;
    }
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      setError('생년월일을 다시 확인해 주세요.');
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
        setError(json.error || '연령 인증에 실패했어요. 다시 시도해 주세요.');
        setSubmitting(false);
        return;
      }

      if (json.data?.age_verified_adult) {
        onVerified();
      } else {
        onMinor();
      }
    } catch {
      setError('네트워크 오류예요. 다시 시도해 주세요.');
      setSubmitting(false);
    }
  }

  const inputStyle = {
    color: 'var(--vm-text-primary)',
    borderBottom: '2px solid rgba(255,255,255,0.1)',
    letterSpacing: '-0.01em',
  } as const;

  return (
    <div className="vm-animate-fade-in-up flex flex-1 flex-col justify-center gap-8 px-8">
      <div className="text-center">
        <h1
          className="text-[26px] font-bold"
          style={{ color: 'var(--vm-text-primary)', letterSpacing: '-0.02em' }}
        >
          생년월일을 알려주세요
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--vm-text-tertiary)' }}>
          만 19세 이상만 이용할 수 있어요
        </p>
      </div>

      <div className="flex items-end justify-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="YYYY"
          autoFocus
          className="w-[88px] bg-transparent py-3 text-center text-2xl font-medium outline-none"
          style={inputStyle}
        />
        <span className="pb-3 text-xl" style={{ color: 'var(--vm-text-tertiary)' }}>
          /
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={month}
          onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="MM"
          className="w-[60px] bg-transparent py-3 text-center text-2xl font-medium outline-none"
          style={inputStyle}
        />
        <span className="pb-3 text-xl" style={{ color: 'var(--vm-text-tertiary)' }}>
          /
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={day}
          onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canProceed) handleSubmit();
          }}
          placeholder="DD"
          className="w-[60px] bg-transparent py-3 text-center text-2xl font-medium outline-none"
          style={inputStyle}
        />
      </div>

      {error && (
        <p className="text-center text-[13px]" style={{ color: 'var(--vm-rose)' }}>
          {error}
        </p>
      )}

      <button
        onClick={canProceed ? handleSubmit : undefined}
        className="w-full rounded-2xl py-4 text-[16px] font-semibold transition-all duration-200"
        style={{
          background: canProceed ? 'var(--vm-purple-deep)' : 'rgba(255,255,255,0.04)',
          color: canProceed ? '#FFF' : 'var(--vm-text-tertiary)',
          cursor: canProceed ? 'pointer' : 'default',
        }}
      >
        {submitting ? '확인 중...' : '다음'}
      </button>

      <p className="text-center text-[11px] leading-relaxed" style={{ color: 'var(--vm-text-tertiary)', opacity: 0.6 }}>
        입력하신 생년월일은 성인 인증 목적으로만 사용되며, 안전하게 보관됩니다.
      </p>
    </div>
  );
}

// ── Step: Minor Block (미성년 차단) ─────────────────────────
function StepMinorBlock() {
  return (
    <div className="vm-animate-fade-in flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <span className="text-[28px]">🔒</span>
      </div>
      <div>
        <h1
          className="text-[22px] font-bold"
          style={{ color: 'var(--vm-text-primary)', letterSpacing: '-0.02em' }}
        >
          만 19세 이상만 이용할 수 있어요
        </h1>
        <p
          className="mt-3 text-[15px] leading-relaxed"
          style={{ color: 'var(--vm-text-tertiary)' }}
        >
          이 서비스는 성인 콘텐츠를 포함하고 있어
          <br />
          청소년은 이용할 수 없어요. 이용에 참고해 주세요.
        </p>
      </div>
    </div>
  );
}

// ── Step 2: Character Select (Fullscreen Swipe) ─────────────
function StepCharacter({
  characters,
  onSelect,
}: {
  characters: DbCharacter[];
  onSelect: (char: DbCharacter) => void;
}) {
  const [charIndex, setCharIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);

  function goTo(idx: number) {
    if (idx < 0 || idx >= characters.length) return;
    setCharIndex(idx);
    setTouchDelta(0);
  }

  function handleTouchEnd() {
    if (Math.abs(touchDelta) > 50) {
      if (touchDelta < 0 && charIndex < characters.length - 1) goTo(charIndex + 1);
      else if (touchDelta > 0 && charIndex > 0) goTo(charIndex - 1);
      else setTouchDelta(0);
    } else setTouchDelta(0);
    setTouchStart(null);
  }

  if (characters.length === 0) return null;

  const c = characters[charIndex];
  const accent = getAccentColor(c.slug);
  const photoBg = getPhotoBg(c.slug);

  return (
    <div
      className="vm-tap-none vm-animate-fade-in-up flex flex-1 select-none flex-col overflow-hidden"
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchMove={(e) => {
        if (touchStart !== null) setTouchDelta(e.touches[0].clientX - touchStart);
      }}
      onTouchEnd={handleTouchEnd}
      onMouseDown={(e) => setTouchStart(e.clientX)}
      onMouseMove={(e) => {
        if (touchStart !== null) setTouchDelta(e.clientX - touchStart);
      }}
      onMouseUp={handleTouchEnd}
      onMouseLeave={() => {
        setTouchDelta(0);
        setTouchStart(null);
      }}
    >
      {/* Title */}
      <div className="py-5 text-center">
        <h1
          className="text-[26px] font-bold"
          style={{ color: 'var(--vm-text-primary)', letterSpacing: '-0.02em' }}
        >
          Who catches your eye?
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--vm-text-tertiary)' }}>
          swipe to explore
        </p>
      </div>

      {/* Card */}
      <div
        className="relative mx-5 flex-1 overflow-hidden rounded-3xl"
        style={{
          transform: `translateX(${touchDelta * 0.3}px)`,
          transition: touchStart !== null ? 'none' : 'transform 0.3s ease',
        }}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: photoBg }}
        >
          {c.avatar_url ? (
            <Image
              src={c.avatar_url}
              alt={c.name}
              fill
              className="object-cover object-top"
              priority
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex size-[100px] items-center justify-center rounded-full text-[40px] font-bold text-white"
                style={{ background: accent, opacity: 0.8 }}
              >
                {c.name.charAt(0)}
              </div>
              <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                character photo
              </span>
            </div>
          )}
        </div>

        {/* Bottom fade + name */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[100px]"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}
        />
        <div className="absolute bottom-4 left-5">
          <p className="text-[28px] font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
            {c.name}
          </p>
          <p className="mt-1 text-[14px] italic" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {c.greeting_message || `Chat with ${c.name}`}
          </p>
        </div>

        {/* Nav arrows */}
        {charIndex > 0 && (
          <button
            onClick={() => goTo(charIndex - 1)}
            className="absolute left-3 top-[45%] z-10 flex size-8 items-center justify-center rounded-full"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        {charIndex < characters.length - 1 && (
          <button
            onClick={() => goTo(charIndex + 1)}
            className="absolute right-3 top-[45%] z-10 flex size-8 items-center justify-center rounded-full"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>

      {/* Dots + CTA */}
      <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-4">
        <div className="flex gap-2">
          {characters.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === charIndex ? 24 : 8,
                height: 8,
                background: i === charIndex ? accent : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => onSelect(c)}
          className="w-full rounded-2xl py-4 text-[16px] font-semibold text-white transition-transform active:scale-[0.98]"
          style={{ background: accent }}
        >
          Chat with {c.name}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: First Message ───────────────────────────────────
function StepFirstMessage({
  name,
  character,
  onEnterChat,
  isCreating,
}: {
  name: string;
  character: DbCharacter;
  onEnterChat: () => void;
  isCreating: boolean;
}) {
  const accent = getAccentColor(character.slug);
  const displayName = name || 'stranger';

  // Use greeting_message or generate a short first message
  const firstMessage =
    character.greeting_message ||
    `Hey ${displayName}~!`;

  return (
    <div
      className="vm-animate-fade-in flex flex-1 flex-col"
      style={{ background: 'var(--vm-base)' }}
    >
      {/* Mini chat header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '0.5px solid var(--vm-glass-border)' }}
      >
        <CharacterAvatar
          src={character.avatar_url}
          name={character.name}
          size={36}
          accentColor={accent}
          showOnline
        />
        <div>
          <p
            className="text-[15px] font-semibold"
            style={{ color: 'var(--vm-text-primary)' }}
          >
            {character.name}
          </p>
          <p className="text-xs font-medium" style={{ color: 'var(--vm-online)' }}>
            online now
          </p>
        </div>
      </div>

      {/* Message area */}
      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-5">
        {/* First message from character */}
        <div
          className="flex items-end gap-2"
          style={{ animation: 'vm-fadeInUp 0.4s ease-out 0.3s both' }}
        >
          <CharacterAvatar
            src={character.avatar_url}
            name={character.name}
            size={28}
            accentColor={accent}
          />
          <div
            className="vm-bubble-ai max-w-[80%] px-4 py-2.5 text-[15px]"
            style={{ color: 'var(--vm-text-primary)', lineHeight: 1.5 }}
          >
            {firstMessage}
          </div>
        </div>

        {/* Typing indicator */}
        <div
          className="flex items-end gap-2"
          style={{ animation: 'vm-fadeInUp 0.4s ease-out 1.2s both' }}
        >
          <div className="size-7 flex-shrink-0" />
          <TypingIndicator />
        </div>
      </div>

      {/* Input bar — tapping sends user to real chat */}
      <div
        className="vm-safe-bottom flex items-center gap-2.5 px-4 pb-3 pt-3"
        style={{ borderTop: '0.5px solid var(--vm-glass-border)' }}
      >
        <button
          onClick={onEnterChat}
          disabled={isCreating}
          className="vm-glass flex flex-1 items-center px-[18px] py-3"
          style={{ borderRadius: 24, cursor: 'pointer' }}
        >
          <span className="text-[15px]" style={{ color: 'var(--vm-text-tertiary)' }}>
            Say something...
          </span>
        </button>
        <div
          className="flex size-11 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--vm-card)' }}
        >
          {isCreating ? (
            <div
              className="size-4 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: accent, borderTopColor: 'transparent' }}
            />
          ) : (
            <ArrowRight className="size-[18px]" style={{ color: 'var(--vm-text-tertiary)' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Onboarding Page ────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [name, setName] = useState('');
  const [selectedChar, setSelectedChar] = useState<DbCharacter | null>(null);
  const [characters, setCharacters] = useState<DbCharacter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  // Check if user already completed onboarding
  useEffect(() => {
    async function checkProfile() {
      try {
        const res = await fetch('/api/profile');
        const json = await res.json();
        if (json.success && json.data?.display_name) {
          router.replace('/select');
          return;
        }
      } catch {
        // proceed with onboarding
      } finally {
        setCheckingProfile(false);
      }
    }
    checkProfile();
  }, [router]);

  // Load characters when reaching step 2
  const loadCharacters = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch('/api/characters');
      const json = await res.json();
      if (json.success) {
        setCharacters(json.data.characters);
      }
    } catch {
      // silently fail
    } finally {
      setLoaded(true);
    }
  }, [loaded]);

  function handleNameNext() {
    setStep(1); // -> age gate
  }

  function handleAgeVerified() {
    loadCharacters();
    setStep(2); // -> character select
  }

  function handleMinorBlocked() {
    setBlocked(true);
  }

  function handleCharSelect(char: DbCharacter) {
    setSelectedChar(char);
    setStep(3); // -> first message
  }

  async function handleEnterChat() {
    if (!selectedChar || isCreating) return;
    setIsCreating(true);

    try {
      // Update display name
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name.trim() || null }),
      });

      // Create conversation
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: selectedChar.id }),
      });
      const json = await res.json();

      if (json.success) {
        router.push(`/chat/${json.data.conversation.id}`);
      } else {
        setIsCreating(false);
      }
    } catch {
      setIsCreating(false);
    }
  }

  if (checkingProfile) {
    return (
      <main
        className="flex h-dvh items-center justify-center"
        style={{ background: 'var(--vm-base)' }}
      >
        <div
          className="size-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--vm-purple-soft)', borderTopColor: 'transparent' }}
        />
      </main>
    );
  }

  return (
    <main
      className="flex h-dvh flex-col"
      style={{ background: 'var(--vm-base)' }}
    >
      {/* Step bar — hidden once we reach the chat preview / block screen */}
      {!blocked && step < 3 && <StepBar current={step} total={4} />}

      {blocked ? (
        <StepMinorBlock />
      ) : (
        <>
          {step === 0 && (
            <StepName name={name} setName={setName} onNext={handleNameNext} />
          )}

          {step === 1 && (
            <StepAge onVerified={handleAgeVerified} onMinor={handleMinorBlocked} />
          )}

          {step === 2 && (
            <StepCharacter characters={characters} onSelect={handleCharSelect} />
          )}

          {step === 3 && selectedChar && (
            <StepFirstMessage
              name={name}
              character={selectedChar}
              onEnterChat={handleEnterChat}
              isCreating={isCreating}
            />
          )}
        </>
      )}
    </main>
  );
}
