'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height
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
    <div className="flex items-end gap-2 border-t border-border/50 bg-background px-3 py-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type a message...'}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-border/50 bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none disabled:opacity-50"
        maxLength={2000}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        aria-label="Send message"
      >
        <Send className="size-4" />
      </button>
    </div>
  );
}
