'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@/hooks/use-chat';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatHeader } from '@/components/chat/chat-header';
import { CharacterAvatar, TypingIndicator } from '@/components/common';
import type { DbCharacter } from '@/types';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = use(params);
  const [character, setCharacter] = useState<DbCharacter | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { messages, isLoading, isSending, creditsRemaining, error, sendMessage } = useChat({
    conversationId,
  });

  // Load conversation data to get character info
  useEffect(() => {
    async function loadConversation() {
      try {
        const res = await fetch('/api/conversations');
        const json = await res.json();

        if (json.success) {
          const conv = json.data.conversations.find(
            (c: { id: string }) => c.id === conversationId
          );
          if (conv?.character) {
            setCharacter(conv.character as DbCharacter);
          } else {
            router.push('/select');
            return;
          }
        }
      } catch {
        router.push('/select');
        return;
      } finally {
        setPageLoading(false);
      }
    }

    loadConversation();
  }, [conversationId, router]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                characterAvatar={character.avatar_url}
                characterName={character.name}
                accentColor={accentColor}
              />
            ))}

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

            <div ref={messagesEndRef} />
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

      <div className="mx-auto w-full max-w-lg">
        <ChatInput
          onSend={sendMessage}
          disabled={isSending || (creditsRemaining !== null && creditsRemaining <= 0)}
          placeholder={`Message ${character.name}...`}
        />
      </div>
    </main>
  );
}
