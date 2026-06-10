'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { CharacterAvatar } from '@/components/common';
import type { DbMessage, DbSelfie, SelfieRarity } from '@/types';

/** Visual-only rarity borders — no text exposed */
function getRarityBorder(rarity: SelfieRarity): string {
  switch (rarity) {
    case 'legendary':
      return '1.5px solid rgba(251, 191, 36, 0.5)';
    case 'epic':
      return '1.5px solid rgba(167, 139, 250, 0.5)';
    case 'rare':
      return '1px solid rgba(96, 165, 250, 0.3)';
    default:
      return 'none';
  }
}

function getRarityAnimation(rarity: SelfieRarity): string | undefined {
  if (rarity === 'legendary') return 'vm-glow-gold 2s ease-in-out infinite';
  return undefined;
}

interface SelfieInlineProps {
  selfie: DbSelfie;
}

function SelfieInline({ selfie }: SelfieInlineProps) {
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const border = getRarityBorder(selfie.rarity);
  const animation = getRarityAnimation(selfie.rarity);

  if (expanded) {
    return (
      <div
        className="vm-animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        onClick={() => setExpanded(false)}
      >
        <div
          className="overflow-hidden"
          style={{
            borderRadius: 16,
            border,
            animation,
            maxWidth: 340,
            maxHeight: '80vh',
          }}
        >
          <Image
            src={selfie.image_url}
            alt="selfie"
            width={340}
            height={450}
            className="h-auto w-full object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setExpanded(true)}
      className="relative cursor-pointer overflow-hidden"
      style={{
        borderRadius: 14,
        border,
        animation,
        maxWidth: 220,
      }}
    >
      {/* Shimmer loader */}
      {!loaded && (
        <div
          className="vm-animate-shimmer"
          style={{
            width: 220,
            height: 280,
            background: 'var(--vm-card)',
          }}
        />
      )}

      <Image
        src={selfie.image_url}
        alt="selfie"
        width={220}
        height={280}
        className="w-full object-cover transition-opacity duration-300"
        style={{
          opacity: loaded ? 1 : 0,
          maxHeight: 280,
        }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

interface MessageBubbleProps {
  message: DbMessage;
  characterAvatar?: string;
  characterName?: string;
  /** Accent color for character avatar fallback */
  accentColor?: string;
  /** Gift slug if this message contains a gift request */
  giftSlug?: string | null;
  /** Character ID for gift purchase */
  characterId?: string;
  /** Edit handler — when provided, the message becomes editable (user messages) */
  onEditMessage?: (messageId: string, newContent: string) => void;
  /** Delete handler — when provided, the message becomes deletable */
  onDeleteMessage?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  characterAvatar,
  characterName,
  accentColor = 'var(--vm-rose)',
  giftSlug,
  characterId,
  onEditMessage,
  onDeleteMessage,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const selfie = message.selfie;

  // Editable only when handlers are provided and it's a real (persisted) message.
  const canModify =
    isUser &&
    !!onEditMessage &&
    !!onDeleteMessage &&
    !message.id.startsWith('optimistic-') &&
    !message.is_proactive;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSheet = () => {
    if (!canModify) return;
    setConfirmingDelete(false);
    setSheetOpen(true);
  };
  const startPress = () => {
    if (!canModify) return;
    pressTimer.current = setTimeout(openSheet, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const beginEdit = () => {
    setDraft(message.content);
    setEditing(true);
    setSheetOpen(false);
  };
  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== message.content) {
      onEditMessage?.(message.id, trimmed);
    }
    setEditing(false);
  };
  const confirmDelete = () => {
    onDeleteMessage?.(message.id);
    setSheetOpen(false);
  };

  // Time formatting
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar — AI messages only */}
      {!isUser && (
        <CharacterAvatar
          src={characterAvatar}
          name={characterName || 'AI'}
          size={32}
          accentColor={accentColor}
        />
      )}

      <div className="flex max-w-[78%] flex-col gap-1">
        {/* Text bubble (or inline editor) */}
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(6, Math.max(1, draft.split('\n').length))}
              className="vm-bubble-user w-full resize-none outline-none"
              style={{
                padding: '10px 16px',
                color: '#FFF',
                fontSize: 15,
                lineHeight: 1.5,
                background: 'var(--vm-purple-soft)',
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full px-3 py-1 text-[12px]"
                style={{ color: 'var(--vm-text-tertiary)', background: 'var(--vm-glass)' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-full px-3 py-1 text-[12px] font-medium"
                style={{ color: '#FFF', background: accentColor }}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          message.content && (
            <div
              className={isUser ? 'vm-bubble-user' : 'vm-bubble-ai'}
              style={{
                padding: '10px 16px',
                color: isUser ? '#FFF' : 'var(--vm-text-primary)',
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: '-0.01em',
                cursor: canModify ? 'pointer' : 'default',
              }}
              onTouchStart={startPress}
              onTouchEnd={cancelPress}
              onTouchMove={cancelPress}
              onContextMenu={
                canModify
                  ? (e) => {
                      e.preventDefault();
                      openSheet();
                    }
                  : undefined
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          )
        )}

        {/* Inline gift button — shown when character requests a gift */}
        {!isUser && giftSlug && characterId && (
          <GiftButtonLazy giftSlug={giftSlug} characterId={characterId} characterName={characterName} />
        )}

        {/* Selfie image */}
        {selfie?.image_url && (
          <SelfieInline selfie={selfie} />
        )}

        {/* Time + edited + read indicator */}
        <div
          className={`flex items-center gap-1.5 ${isUser ? 'justify-end pr-0.5' : 'justify-start pl-0.5'}`}
        >
          <span
            className="text-[11px]"
            style={{ color: 'var(--vm-text-tertiary)' }}
          >
            {time}
          </span>
          {message.edited_at && (
            <span className="text-[11px]" style={{ color: 'var(--vm-text-tertiary)' }}>
              · 수정됨
            </span>
          )}
          {isUser && (
            <span
              className="text-[11px]"
              style={{ color: 'var(--vm-purple-soft)' }}
            >
              ✓✓
            </span>
          )}
        </div>
      </div>

      {/* Action sheet (long-press / right-click on own message) */}
      {sheetOpen && (
        <div
          className="vm-animate-fade-in fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="vm-animate-fade-in-up mb-6 w-[calc(100%-32px)] max-w-sm overflow-hidden rounded-2xl"
            style={{
              background: 'var(--vm-card)',
              border: '0.5px solid var(--vm-glass-border)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={beginEdit}
                  className="block w-full px-5 py-4 text-left text-[15px]"
                  style={{
                    color: 'var(--vm-text-primary)',
                    borderBottom: '0.5px solid var(--vm-glass-border)',
                  }}
                >
                  ✏️ 수정
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="block w-full px-5 py-4 text-left text-[15px]"
                  style={{ color: '#ff6b6b' }}
                >
                  🗑️ 삭제
                </button>
              </>
            ) : (
              <>
                <div
                  className="px-5 py-4 text-[14px]"
                  style={{
                    color: 'var(--vm-text-secondary)',
                    borderBottom: '0.5px solid var(--vm-glass-border)',
                  }}
                >
                  이 메시지와 그에 대한 답장을 삭제할까요? 되돌릴 수 없어요.
                </div>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="block w-full px-5 py-4 text-left text-[15px] font-medium"
                  style={{ color: '#ff6b6b' }}
                >
                  삭제하기
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="block w-full px-5 py-4 text-center text-[15px]"
              style={{
                color: 'var(--vm-text-tertiary)',
                borderTop: '0.5px solid var(--vm-glass-border)',
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lazy-loaded gift button to avoid importing in every bubble */
function GiftButtonLazy({ giftSlug, characterId, characterName }: { giftSlug: string; characterId: string; characterName?: string }) {
  const [GiftButton, setGiftButton] = useState<React.ComponentType<{
    giftSlug: string;
    characterId: string;
    characterName?: string;
  }> | null>(null);

  useState(() => {
    import('./gift-button').then((mod) => {
      setGiftButton(() => mod.GiftButton);
    });
  });

  if (!GiftButton) return null;
  return <GiftButton giftSlug={giftSlug} characterId={characterId} characterName={characterName} />;
}
