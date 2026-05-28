'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = value.trim().length > 0;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <div
      className="vm-safe-bottom vm-tap-none flex items-end gap-2.5 px-3.5 pt-2.5 pb-2.5"
      style={{
        background: 'rgba(10, 10, 18, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid var(--vm-glass-border)',
      }}
    >
      {/* Input field */}
      <div
        className="vm-glass flex flex-1 items-center"
        style={{ borderRadius: 24, padding: '10px 18px' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Type a message...'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:opacity-40 disabled:opacity-50"
          style={{
            color: 'var(--vm-text-primary)',
            letterSpacing: '-0.01em',
          }}
          maxLength={2000}
        />
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={disabled || !hasText}
        className="flex size-11 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200"
        style={{
          background: hasText ? 'var(--vm-purple)' : 'var(--vm-card)',
          boxShadow: hasText ? '0 4px 16px rgba(124, 58, 237, 0.4)' : 'none',
        }}
        aria-label="Send message"
      >
        <ArrowRight
          className="size-[18px]"
          style={{ color: hasText ? '#FFF' : 'var(--vm-text-tertiary)' }}
        />
      </button>
    </div>
  );
}
