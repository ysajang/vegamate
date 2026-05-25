'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@/hooks/use-chat';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatHeader } from '@/components/chat/chat-header';
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

  if (pageLoading || !character) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-background">
      <ChatHeader
        characterName={character.name}
        characterAvatar={character.avatar_url}
        creditsRemaining={creditsRemaining}
      />

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                characterAvatar={character.avatar_url}
                characterName={character.name}
              />
            ))}

            {isSending && (
              <div className="flex gap-2.5">
                <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-card">
                  <span className="text-xs">{character.name[0]}</span>
                </div>
                <div className="rounded-2xl rounded-bl-md bg-card px-4 py-3">
                  <div className="flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Credit warning */}
      {creditsRemaining !== null && creditsRemaining <= 5 && creditsRemaining > 0 && (
        <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-400">
          Low credits ({creditsRemaining} remaining)
        </div>
      )}

      {creditsRemaining !== null && creditsRemaining <= 0 && (
        <div className="border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
          No credits remaining. Purchase more to continue chatting.
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
