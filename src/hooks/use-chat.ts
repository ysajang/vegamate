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
  heartsRemaining: number | null;
  error: string | null;
  /** When hearts run out, character says goodbye */
  heartsExhausted: boolean;
  exhaustionMessage: string | null;
  /** Gift slug the character is requesting (inline button) */
  lastGiftRequest: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearExhaustion: () => void;
}

export function useChat({ conversationId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [heartsRemaining, setHeartsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heartsExhausted, setHeartsExhausted] = useState(false);
  const [exhaustionMessage, setExhaustionMessage] = useState<string | null>(null);
  const [lastGiftRequest, setLastGiftRequest] = useState<string | null>(null);
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

  // Load hearts balance
  useEffect(() => {
    async function loadHearts() {
      try {
        const res = await fetch('/api/hearts');
        const json = await res.json();
        if (json.success) {
          setHeartsRemaining(json.data.balance);
        }
      } catch {
        // Silent fail
      }
    }
    loadHearts();
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
      setLastGiftRequest(null);

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
        is_proactive: false,
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
          // Check if hearts are exhausted
          if (json.data.hearts_exhausted) {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
            setHeartsExhausted(true);
            setExhaustionMessage(json.data.exhaustion_message);
            setHeartsRemaining(0);
            return;
          }

          // Normal response
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => m.id !== optimisticMsg.id);
            const aiMsg = json.data.message as DbMessage;
            if (withoutOptimistic.some((m) => m.id === aiMsg.id)) {
              return withoutOptimistic;
            }
            return [...withoutOptimistic, aiMsg];
          });
          setHeartsRemaining(json.data.hearts_remaining);

          // Check for gift request
          if (json.data.gift_request) {
            setLastGiftRequest(json.data.gift_request);
          }
        } else {
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

  const clearExhaustion = useCallback(() => {
    setHeartsExhausted(false);
    setExhaustionMessage(null);
  }, []);

  return {
    messages,
    isLoading,
    isSending,
    heartsRemaining,
    error,
    heartsExhausted,
    exhaustionMessage,
    lastGiftRequest,
    sendMessage,
    clearExhaustion,
  };
}
