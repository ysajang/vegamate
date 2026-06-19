'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbMessage } from '@/types';
import { shouldGateInput } from './exhaustion-gate';

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
  /** In-chat subscription upgrade prompt surfaced at an emotional peak */
  upgradePrompt: { tier: 'deeper' | 'lover'; stage: number } | null;
  /** Dismiss the current upgrade prompt */
  dismissUpgradePrompt: () => void;
  /** Whether older messages exist to load (infinite scroll) */
  hasMore: boolean;
  /** Whether an older page is currently being fetched */
  isLoadingMore: boolean;
  /** Fetch the next older page; returns the number of messages prepended */
  loadMore: () => Promise<number>;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  clearExhaustion: () => Promise<void>;
}

const PAGE_SIZE = 50;

export function useChat({ conversationId }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [heartsRemaining, setHeartsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heartsExhausted, setHeartsExhausted] = useState(false);
  const [exhaustionMessage, setExhaustionMessage] = useState<string | null>(null);
  const [lastGiftRequest, setLastGiftRequest] = useState<string | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<{ tier: 'deeper' | 'lover'; stage: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const supabaseRef = useRef(createClient());
  // Mirror of messages for use inside callbacks without re-creating them.
  const messagesRef = useRef<DbMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Fetch the authoritative balance and reconcile the input gate. Lifts the gate
  // when hearts are present (or the user is a subscriber) and engages it when the
  // user is out of hearts. Shared by initial load, focus-return (post-purchase),
  // and gift-sheet close. Never claims daily hearts (that's a one-shot on mount).
  const refreshHeartsGate = useCallback(async () => {
    try {
      const res = await fetch('/api/hearts');
      const json = await res.json();
      if (!json.success) return;
      const subscriber = Boolean(json.data.is_subscriber);
      setHeartsRemaining(json.data.balance);
      const gated = shouldGateInput({ balance: json.data.balance, isSubscriber: subscriber });
      setHeartsExhausted(gated);
      if (!gated) setExhaustionMessage(null);
    } catch {
      // Silent — keep the current gate state.
    }
  }, []);

  // Load initial messages (shows loading spinner)
  useEffect(() => {
    async function loadMessages() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`, {
          cache: 'no-store',
        });
        const json = await res.json();

        if (json.success) {
          setMessages(json.data.messages);
          setHasMore(!!json.data.has_more);
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

  // Silent re-sync: re-fetch the authoritative message list and merge by id
  // WITHOUT a loading spinner. Used when the tab/app regains focus so that
  // messages sent on another device (web ↔ mobile) show up here too. This
  // also recovers anything the realtime subscription may have missed.
  useEffect(() => {
    let cancelled = false;

    async function refreshMessages() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages?limit=50`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (cancelled || !json.success) return;

        const serverMessages = (json.data.messages || []) as DbMessage[];
        setMessages((prev) => {
          const byId = new Map<string, DbMessage>();
          // Keep any optimistic placeholders that haven't been persisted yet
          for (const m of prev) {
            if (m.id.startsWith('optimistic-')) byId.set(m.id, m);
          }
          // Server is authoritative for everything else
          for (const m of serverMessages) byId.set(m.id, m);
          return Array.from(byId.values()).sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      } catch {
        // Silent — keep showing whatever we have
      }
    }

    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshMessages();
        // A gift purchase completes out-of-tab (PayPal -> webhook). On return,
        // re-check the balance so refilled hearts lift the gate without a manual
        // reload. Never re-gates here on its own beyond the shared rule.
        refreshHeartsGate();
      }
    };

    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [conversationId, refreshHeartsGate]);

  // Load hearts balance (internal accounting only — never rendered to the user).
  // Daily hearts are auto-claimed silently on mount; refreshHeartsGate() then
  // does the authoritative balance read + input-gate reconciliation.
  useEffect(() => {
    async function loadHearts() {
      try {
        const probe = await fetch('/api/hearts');
        const json = await probe.json();
        if (json.success && json.data.can_claim_daily) {
          try {
            await fetch('/api/hearts/daily', { method: 'POST' });
          } catch {
            // Silent — refreshHeartsGate still reconciles the real balance.
          }
        }
      } catch {
        // Silent — refreshHeartsGate below still attempts the read.
      }
      await refreshHeartsGate();
    }
    loadHearts();
  }, [refreshHeartsGate]);

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
            // Exact duplicate → skip
            if (prev.some((m) => m.id === newMessage.id)) return prev;

            // If the real user message arrived via Realtime before the API
            // response, replace the optimistic placeholder to avoid a brief
            // duplicate flash. Match by role + content + optimistic id prefix.
            const optimisticIdx = newMessage.role === 'user'
              ? prev.findIndex(
                  (m) =>
                    m.id.startsWith('optimistic-') &&
                    m.role === 'user' &&
                    m.content === newMessage.content
                )
              : -1;

            let merged: DbMessage[];
            if (optimisticIdx >= 0) {
              // Swap optimistic → real in-place (preserves position)
              merged = [...prev];
              merged[optimisticIdx] = newMessage;
            } else {
              merged = [...prev, newMessage];
            }

            // Keep chronological order — realtime can arrive out of order
            merged.sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            return merged;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as DbMessage;
          setMessages((prev) => {
            // Soft-deleted elsewhere → drop it from the view
            if (updated.deleted_at) {
              return prev.filter((m) => m.id !== updated.id);
            }
            // Edited elsewhere → replace in place
            return prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
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
      setUpgradePrompt(null);

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
          // Normal response.
          // Realtime delivery is best-effort and races with this handler:
          // the persisted user/AI messages may already be present (realtime
          // won) or missing (realtime lost/late). So we drop the optimistic
          // placeholder and merge the authoritative server messages by id,
          // which is correct regardless of who arrived first. This avoids both
          // a vanishing user bubble AND a duplicated one.
          setMessages((prev) => {
            const realUserMsg = json.data.user_message as DbMessage | undefined;
            const aiMsg = json.data.message as DbMessage | undefined;

            const byId = new Map<string, DbMessage>();
            for (const m of prev) {
              // Drop the optimistic placeholder ONLY if we have an
              // authoritative replacement for it (server-returned user_message
              // or one already delivered via realtime). Otherwise keep it, so
              // the user's bubble never vanishes mid-response.
              if (m.id === optimisticMsg.id) {
                const haveReplacement =
                  !!realUserMsg ||
                  prev.some(
                    (x) =>
                      x.role === 'user' &&
                      x.id !== optimisticMsg.id &&
                      x.content === optimisticMsg.content
                  );
                if (haveReplacement) continue;
              }
              byId.set(m.id, m);
            }
            if (realUserMsg) byId.set(realUserMsg.id, realUserMsg);
            if (aiMsg) byId.set(aiMsg.id, aiMsg);

            return Array.from(byId.values()).sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
          setHeartsRemaining(json.data.hearts_remaining);

          // Check for gift request
          if (json.data.gift_request) {
            setLastGiftRequest(json.data.gift_request);
          }

          // Out-of-messages: the character DID reply (begging in-character) and
          // a gift card is attached above. Now gate the input — the next turn
          // needs a gift. This is set AFTER the reply renders, so the user sees
          // the response + gift card, not a bare wall. (Not set on crisis turns:
          // the server omits hearts_exhausted then so support keeps flowing.)
          if (json.data.hearts_exhausted) {
            setHeartsExhausted(true);
            setHeartsRemaining(0);
          }

          // Check for in-chat upgrade prompt (emotional peak)
          if (json.data.upgrade_prompt) {
            setUpgradePrompt(json.data.upgrade_prompt);
          }
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
          if (json.code === 'AGE_NOT_VERIFIED') {
            window.location.href = '/onboarding';
            return;
          }
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

  // Edit a user message's content (optimistic, reverts on failure).
  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed || messageId.startsWith('optimistic-')) return;

      const snapshot = messagesRef.current;
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: trimmed, edited_at: nowIso } : m
        )
      );

      try {
        const res = await fetch(`/api/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'edit failed');
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, ...json.data.message } : m))
        );
      } catch {
        setMessages(snapshot);
        setError('메시지 수정에 실패했어요');
      }
    },
    []
  );

  // Soft-delete a user message + its paired AI reply (optimistic, reverts on failure).
  const deleteMessage = useCallback(async (messageId: string) => {
    if (messageId.startsWith('optimistic-')) return;

    const snapshot = messagesRef.current;
    const idx = snapshot.findIndex((m) => m.id === messageId);
    if (idx < 0 || snapshot[idx].role !== 'user') return;

    // Mirror server logic: remove the user message + the direct AI reply/replies
    // up to the next user message. Proactive messages (AI-initiated, not a reply
    // to this turn) are NOT part of the pair and stay.
    const removeIds = new Set<string>([messageId]);
    for (let i = idx + 1; i < snapshot.length; i++) {
      if (snapshot[i].role === 'user') break;
      if (snapshot[i].role === 'assistant' && !snapshot[i].is_proactive) {
        removeIds.add(snapshot[i].id);
      }
    }

    setMessages((prev) => prev.filter((m) => !removeIds.has(m.id)));

    try {
      const res = await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'delete failed');
      const ids = new Set<string>(json.data.deleted_ids || []);
      setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
    } catch {
      setMessages(snapshot);
      setError('메시지 삭제에 실패했어요');
    }
  }, []);

  // Called when the gift sheet closes. Closing alone must NOT unlock the
  // composer — the purchase is async (PayPal -> webhook), so we re-check the
  // real balance and only lift the gate once hearts were actually refilled.
  // Otherwise a plain close at zero balance would re-enable chat and re-trigger
  // the beg + sheet every turn (the infinite "선물 창" loop).
  const clearExhaustion = useCallback(async () => {
    await refreshHeartsGate();
  }, [refreshHeartsGate]);

  // Load the next older page (infinite scroll). Returns how many messages
  // were prepended so the caller can preserve scroll position.
  const loadMore = useCallback(async (): Promise<number> => {
    if (isLoadingMore || !hasMore) return 0;

    // Oldest persisted (non-optimistic) message is the cursor.
    const oldest = messagesRef.current.find((m) => !m.id.startsWith('optimistic-'));
    if (!oldest) return 0;

    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest.created_at)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!json.success) return 0;

      const older = (json.data.messages || []) as DbMessage[];
      setHasMore(!!json.data.has_more);

      if (older.length === 0) return 0;

      setMessages((prev) => {
        const byId = new Map<string, DbMessage>();
        for (const m of older) byId.set(m.id, m);
        for (const m of prev) byId.set(m.id, m);
        return Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      return older.length;
    } catch {
      return 0;
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, isLoadingMore, hasMore]);

  return {
    messages,
    isLoading,
    isSending,
    heartsRemaining,
    error,
    heartsExhausted,
    exhaustionMessage,
    lastGiftRequest,
    upgradePrompt,
    dismissUpgradePrompt: () => setUpgradePrompt(null),
    hasMore,
    isLoadingMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    clearExhaustion,
  };
}
