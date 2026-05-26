'use client';

import Image from 'next/image';

interface CharacterAvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  accentColor?: string;
  showOnline?: boolean;
  glow?: boolean;
  className?: string;
}

export function CharacterAvatar({
  src,
  name,
  size = 36,
  accentColor = 'var(--vm-purple)',
  showOnline = false,
  glow = false,
  className = '',
}: CharacterAvatarProps) {
  const letter = name.charAt(0).toUpperCase();
  const onlineDotSize = Math.max(10, Math.round(size * 0.28));

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{
            width: size,
            height: size,
            boxShadow: glow ? `0 0 16px ${accentColor}40` : 'none',
          }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: size,
            height: size,
            background: accentColor,
            fontSize: size * 0.4,
            fontWeight: 600,
            color: '#FFF',
            boxShadow: glow ? `0 0 16px ${accentColor}40` : 'none',
          }}
        >
          {letter}
        </div>
      )}

      {/* Glow ring */}
      {glow && (
        <div
          className="pointer-events-none absolute inset-[-2px] rounded-full"
          style={{ border: `2px solid ${accentColor}30` }}
        />
      )}

      {/* Online indicator */}
      {showOnline && (
        <div
          className="absolute bottom-[-1px] right-[-1px] rounded-full"
          style={{
            width: onlineDotSize,
            height: onlineDotSize,
            background: 'var(--vm-online)',
            border: '2px solid var(--vm-base)',
            boxShadow: '0 0 6px rgba(52, 211, 153, 0.4)',
          }}
        />
      )}
    </div>
  );
}
