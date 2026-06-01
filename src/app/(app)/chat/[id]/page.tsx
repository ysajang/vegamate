'use client';

import { useEffect, useLayoutEffect, useState, useRef, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useChat } from '@/hooks/use-chat';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatHeader } from '@/components/chat/chat-header';
import { CharacterAvatar, TypingIndicator } from '@/components/common';
import { GiftSheet } from '@/components/chat/gift-sheet';
import { UpgradePrompt } from '@/components/chat/upgrade-prompt';
import { HeartClaimPopup } from '@/components/chat/heart-claim-popup';
import { LowBalanceBanner } from '@/components/chat/low-balance-banner';
import { HEART_CONFIG } from '@/config/constants';
import type { DbCharacter } from '@/types';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = use(params);
  const [character, setCharacter] = useState<DbCharacter | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Whether the view is currently pinned near the bottom. Auto-scroll only
  // fires when this is true (or the user just sent a message), so reading
  // older messages isn't interrupted by new incoming ones.
  const isNearBottomRef = useRef(true);
  // When loading older messages, capture scrollHeight before prepend so we can
  // restore the visual position afterward (no jump).
  const prependAnchorRef = useRef<number | null>(null);
  const router = useRouter();

  const {
    messages,
    isLoading,
    isSending,
    heartsRemaining,
    error,
    heartsExhausted,
    exhaustionMessage,
    lastGiftRequest,
    upgradePrompt,
    dismissUpgradePrompt,
    hasMore,
    isLoadingMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    clearExhaustion,
  } = useChat({ conversationId });

  // Load conversation data to get character info
  useEffect(() => {
    let cancelled = false;

    // Notification deep-links land here. If we redirect to /select on the first
    // transient hiccup (auth session not yet attached, brief network error, or
    // a just-created conversation not yet in the list), the user gets bounced
    // to the character carousel. So we retry a couple of times and only fall
    // back to /select when the conversation is genuinely absent.
    async function loadConversation(attempt = 0): Promise<void> {
      const MAX_ATTEMPTS = 3;
      try {
        const res = await fetch('/api/conversations');

        // Not signed in -> go to login, not /select.
        if (res.status === 401) {
          if (!cancelled) router.replace('/login');
          return;
        }

        const json = await res.json();

        if (json.success) {
          const conv = json.data.conversations.find(
            (c: { id: string }) => c.id === conversationId
          );
          if (conv?.character) {
            if (!cancelled) {
              setCharacter(conv.character as DbCharacter);
              setPageLoading(false);
            }
            return;
          }

          // Conversation not found yet. It may be propagation lag for a freshly
          // created conversation -> retry before giving up.
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            if (!cancelled) return loadConversation(attempt + 1);
            return;
          }

          // Genuinely not in the user's list -> safe to send to /select.
          if (!cancelled) router.replace('/select');
          return;
        }

        // Non-success payload (server error etc.) -> retry, don't bounce.
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          if (!cancelled) return loadConversation(attempt + 1);
        } else if (!cancelled) {
          setPageLoading(false);
        }
      } catch {
        // Network error -> retry instead of redirecting away.
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          if (!cancelled) return loadConversation(attempt + 1);
        } else if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    loadConversation();

    return () => {
      cancelled = true;
    };
  }, [conversationId, router]);

  // Distance from the bottom (px) within which we consider the view "pinned".
  const NEAR_BOTTOM_THRESHOLD = 120;
  // Trigger loading older messages when within this many px of the top.
  const NEAR_TOP_THRESHOLD = 150;

  // Capture position, then load an older page (infinite scroll upward).
  const triggerLoadMore = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Remember height before prepend so the layout effect can restore position.
    prependAnchorRef.current = el.scrollHeight;
    loadMore().then((added) => {
      // If nothing was added, drop the anchor so we don't shift anything.
      if (added === 0) prependAnchorRef.current = null;
    });
  }, [loadMore]);

  // Track scroll position → toggle the scroll-down button, the near-bottom
  // flag, and trigger upward infinite scroll near the top.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);

    if (el.scrollTop < NEAR_TOP_THRESHOLD && hasMore && !isLoadingMore) {
      triggerLoadMore();
    }
  }, [hasMore, isLoadingMore, triggerLoadMore]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  // After older messages are prepended, restore the visual scroll position so
  // the view doesn't jump. Runs synchronously before paint (useLayoutEffect).
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || prependAnchorRef.current === null) return;
    const heightDelta = el.scrollHeight - prependAnchorRef.current;
    el.scrollTop += heightDelta;
    prependAnchorRef.current = null;
  }, [messages]);

  // Auto-scroll on new messages / typing indicator.
  // On initial load: instant scroll to the latest message.
  // After that: only follow new content when the user is already near the
  // bottom OR just sent a message (isSending) — otherwise show the button.
  const hasScrolledInitial = useRef(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (isLoading) return;              // messages not rendered yet

    // Skip auto-scroll when this update was an older-page prepend (handled by
    // the layout effect that preserves position).
    if (prependAnchorRef.current !== null) return;

    const isInitial = !hasScrolledInitial.current;
    if (isInitial) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      });
      hasScrolledInitial.current = true;
      return;
    }

    if (isNearBottomRef.current || isSending) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      // New content arrived while reading older messages → surface the button
      setShowScrollDown(true);
    }
  }, [messages, isSending, isLoading]);

  // Open gift sheet when hearts exhausted
  useEffect(() => {
    if (heartsExhausted) {
      setGiftSheetOpen(true);
    }
  }, [heartsExhausted]);

  // Handle heart claim
  const handleHeartClaimed = useCallback((_amount: number, _balance: number) => {
    // Hearts balance will be refreshed on next send
  }, []);

  // Determine character accent color
  const accentColor = character?.slug === 'ren'
    ? 'var(--vm-cool)'
    : 'var(--vm-rose)';

  if (pageLoading || !character) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center"
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
      <ChatHeader
        characterName={character.name}
        characterAvatar={character.avatar_url}
        accentColor={accentColor}
      />

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="vm-scrollbar-hide relative flex-1 overflow-y-auto px-3.5 py-4"
      >
        {/* Subtle ambient glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-[20%] z-0 size-[300px] -translate-x-1/2 rounded-full"
          style={{ background: 'rgba(59, 7, 100, 0.07)' }}
        />

        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div
              className="size-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--vm-purple-soft)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <div className="relative z-[1] mx-auto flex max-w-lg flex-col gap-4">
            {/* Infinite-scroll loader for older messages */}
            {isLoadingMore && (
              <div className="flex justify-center py-1">
                <div
                  className="size-4 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: 'var(--vm-purple-soft)', borderTopColor: 'transparent' }}
                />
              </div>
            )}

            {/* Date separator */}
            <div className="flex justify-center py-2">
              <span
                className="rounded-full px-3.5 py-1 text-[11px]"
                style={{
                  color: 'var(--vm-text-tertiary)',
                  background: 'rgba(26, 26, 46, 0.5)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                Today
              </span>
            </div>

            {messages.map((msg, idx) => {
              // Show gift button only on the latest AI message that has a gift request
              const isLastMessage = idx === messages.length - 1;
              const showGiftButton =
                isLastMessage &&
                msg.role === 'assistant' &&
                lastGiftRequest;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  characterAvatar={character.avatar_url}
                  characterName={character.name}
                  accentColor={accentColor}
                  giftSlug={showGiftButton ? lastGiftRequest : null}
                  characterId={character.id}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                />
              );
            })}

            {/* In-chat upgrade prompt (emotional peak) — stays in the
                conversation, never bounces to a separate store page */}
            {upgradePrompt && !isSending && (
              <div className="flex items-end gap-2.5">
                <CharacterAvatar
                  src={character.avatar_url}
                  name={character.name}
                  size={32}
                  accentColor={accentColor}
                />
                <UpgradePrompt
                  tierSlug={upgradePrompt.tier}
                  characterId={character.id}
                  characterName={character.name}
                  onDismiss={dismissUpgradePrompt}
                />
              </div>
            )}

            {/* Typing indicator */}
            {isSending && (
              <div className="flex items-end gap-2.5">
                <CharacterAvatar
                  src={character.avatar_url}
                  name={character.name}
                  size={32}
                  accentColor={accentColor}
                />
                <TypingIndicator />
              </div>
            )}

            <div ref={messagesEndRef} className="h-4 shrink-0" />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 text-center text-xs"
          style={{
            color: 'var(--vm-rose)',
            background: 'rgba(244, 63, 94, 0.08)',
            borderTop: '0.5px solid rgba(244, 63, 94, 0.15)',
          }}
        >
          {error}
        </div>
      )}

      {/* Scroll-to-bottom button — floats above the input when scrolled up */}
      <div className="pointer-events-none relative mx-auto w-full max-w-lg">
        {showScrollDown && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Scroll to latest message"
            className="vm-tap-none vm-animate-fade-in pointer-events-auto absolute -top-12 right-3.5 z-10 flex size-10 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              background: 'var(--vm-glass)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '0.5px solid var(--vm-glass-border)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              color: accentColor,
            }}
          >
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Proactive low-balance gift nudge — appears before the user hits zero,
          so they top up instead of slamming into an out-of-messages error. */}
      {!heartsExhausted && heartsRemaining !== null && (
        <LowBalanceBanner
          balance={heartsRemaining}
          threshold={HEART_CONFIG.LOW_BALANCE_THRESHOLD}
          accentColor={accentColor}
          onOpenGift={() => setGiftSheetOpen(true)}
        />
      )}

      <div className="mx-auto w-full max-w-lg">
        <ChatInput
          onSend={sendMessage}
          disabled={isSending || heartsExhausted}
          placeholder={
            heartsExhausted
              ? 'Send a gift to keep chatting!'
              : `Message ${character.name}...`
          }
        />
      </div>

      {/* Gift bottom sheet */}
      <GiftSheet
        isOpen={giftSheetOpen}
        onClose={() => {
          setGiftSheetOpen(false);
          clearExhaustion();
        }}
        characterId={character.id}
        exhaustionMessage={exhaustionMessage}
      />

      {/* Daily heart claim popup */}
      <HeartClaimPopup onClaimed={handleHeartClaimed} />
    </main>
  );
}
