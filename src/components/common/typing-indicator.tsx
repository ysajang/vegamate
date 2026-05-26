'use client';

interface TypingIndicatorProps {
  label?: string;
}

export function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="vm-bubble-ai flex items-center gap-[5px] px-[18px] py-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="size-[7px] rounded-full"
            style={{
              background: 'var(--vm-purple-soft)',
              animation: `vm-pulse-dot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
      {label && (
        <span
          className="text-xs"
          style={{ color: 'var(--vm-text-tertiary)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
