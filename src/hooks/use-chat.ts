'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbMessage } from '@/types';

interface UseChatOptions {
  conversationId: string;
}

interface UseChatReturn {
  messages: DbMessage[];
  isLoading: boolean;
  isSending: boolean;
  creditsRemaining: number | null;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
}

export function useChat({ conversationId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  // Load initial messages
  useEffect(() => {
    async function loadMessages() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages?limit=50`);
        const json = await res.json();

        if (json.success) {
          setMessages(json.data.messages);
        } else {
          setError(json.error || 'Failed to load messages');
        }
      } catch {
        setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [conversationId]);

  // Load credits
  useEffect(() => {
    async function loadCredits() {
      try {
        const res = await fetch('/api/credits');
        const json = await res.json();
        if (json.success) {
          setCreditsRemaining(json.data.balance);
        }
      } catch {
        // Silent fail for credits
      }
    }
    loadCredits();
  }, []);

  // Subscribe to realtime messages
  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as DbMessage;
          setMessages((prev) => {
            // Avoid duplicates (optimistic update may already have it)
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (isSending || !content.trim()) return;

      setIsSending(true);
      setError(null);

      // Optimistic update for user message
      const optimisticMsg: DbMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content_type: 'text',
        content: content.trim(),
        selfie_id: null,
        selfie_rarity: null,
        credits_consumed: 1,
        metadata: null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId,
            content: content.trim(),
          }),
        });

        const json = await res.json();

        if (json.success) {
          // Remove optimistic message, the realtime subscription will add the real ones
          // But also add AI response immediately for snappy UX
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => m.id !== optimisticMsg.id);
            // AI message from response (realtime might not have arrived yet)
            const aiMsg = json.data.message as DbMessage;
            if (withoutOptimistic.some((m) => m.id === aiMsg.id)) {
              return withoutOptimistic;
            }
            return [...withoutOptimistic, aiMsg];
          });
          setCreditsRemaining(json.data.credits_remaining);
        } else {
          // Remove optimistic message on error
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
          setError(json.error || 'Failed to send message');
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setError('Network error. Please try again.');
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending]
  );

  return {
    messages,
    isLoading,
    isSending,
    creditsRemaining,
    error,
    sendMessage,
  };
}
