import { describe, it, expect, vi } from 'vitest';
import {
  parseUtmParams,
  captureUtmFromSearch,
  getStoredUtm,
  trackFunnelEvent,
  UTM_STORAGE_KEY,
  type UtmStorage,
  type FunnelClient,
} from './funnel';

function memoryStorage(initial: Record<string, string> = {}): UtmStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

function fakeClient(opts?: {
  userId?: string | null;
  insertError?: unknown;
}): { client: FunnelClient; inserts: Record<string, unknown>[] } {
  const inserts: Record<string, unknown>[] = [];
  const client: FunnelClient = {
    auth: {
      getUser: async () => ({
        data: {
          user:
            opts?.userId === null ? null : { id: opts?.userId ?? 'user-1' },
        },
      }),
    },
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        inserts.push({ table, ...values });
        return Promise.resolve({ error: opts?.insertError ?? null });
      },
    }),
  };
  return { client, inserts };
}

describe('parseUtmParams', () => {
  it('extracts utm params from a query string', () => {
    expect(
      parseUtmParams('?utm_source=meta_ads&utm_medium=cpc&utm_content=hook3'),
    ).toEqual({
      utm_source: 'meta_ads',
      utm_medium: 'cpc',
      utm_content: 'hook3',
    });
  });

  it('returns null when no utm params are present', () => {
    expect(parseUtmParams('?ref=abc&x=1')).toBeNull();
    expect(parseUtmParams('')).toBeNull();
  });

  it('ignores empty values and truncates long ones', () => {
    expect(parseUtmParams('?utm_source=&utm_medium=cpc')).toEqual({
      utm_medium: 'cpc',
    });
    const long = 'a'.repeat(500);
    const parsed = parseUtmParams(`?utm_campaign=${long}`);
    expect(parsed?.utm_campaign).toHaveLength(200);
  });
});

describe('captureUtmFromSearch / getStoredUtm', () => {
  it('stores utm on first touch', () => {
    const storage = memoryStorage();
    captureUtmFromSearch('?utm_source=meta_ads&utm_content=hook1', storage);
    expect(getStoredUtm(storage)).toEqual({
      utm_source: 'meta_ads',
      utm_content: 'hook1',
    });
  });

  it('does not overwrite an existing attribution (first-touch wins)', () => {
    const storage = memoryStorage({
      [UTM_STORAGE_KEY]: JSON.stringify({ utm_source: 'original' }),
    });
    captureUtmFromSearch('?utm_source=second_visit', storage);
    expect(getStoredUtm(storage)).toEqual({ utm_source: 'original' });
  });

  it('is a no-op without utm params or without storage', () => {
    const storage = memoryStorage();
    captureUtmFromSearch('?foo=bar', storage);
    expect(getStoredUtm(storage)).toBeNull();
    expect(() => captureUtmFromSearch('?utm_source=x', null)).not.toThrow();
  });

  it('returns null for corrupted stored values', () => {
    const storage = memoryStorage({ [UTM_STORAGE_KEY]: '{not json' });
    expect(getStoredUtm(storage)).toBeNull();
    const arrStorage = memoryStorage({ [UTM_STORAGE_KEY]: '[1,2]' });
    expect(getStoredUtm(arrStorage)).toBeNull();
  });
});

describe('trackFunnelEvent', () => {
  it('inserts event with user_id, event_name, and utm metadata', async () => {
    const storage = memoryStorage({
      [UTM_STORAGE_KEY]: JSON.stringify({ utm_source: 'meta_ads' }),
    });
    const { client, inserts } = fakeClient({ userId: 'user-42' });

    await trackFunnelEvent(
      'chat_enter',
      { conversation_id: 'conv-1' },
      client,
      storage,
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      table: 'funnel_events',
      user_id: 'user-42',
      event_name: 'chat_enter',
      metadata: {
        conversation_id: 'conv-1',
        utm: { utm_source: 'meta_ads' },
      },
    });
  });

  it('sends null metadata when there is nothing to attach', async () => {
    const { client, inserts } = fakeClient();
    await trackFunnelEvent('signup_complete', undefined, client, memoryStorage());
    expect(inserts[0].metadata).toBeNull();
  });

  it('does nothing without an authenticated user', async () => {
    const { client, inserts } = fakeClient({ userId: null });
    await trackFunnelEvent('signup_complete', undefined, client, memoryStorage());
    expect(inserts).toHaveLength(0);
  });

  it('never throws — auth failure, insert rejection, storage failure', async () => {
    const throwingClient: FunnelClient = {
      auth: {
        getUser: async () => {
          throw new Error('network down');
        },
      },
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    };
    await expect(
      trackFunnelEvent('chat_enter', undefined, throwingClient, memoryStorage()),
    ).resolves.toBeUndefined();

    const rejectingClient: FunnelClient = {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: () => ({
        insert: () => Promise.reject(new Error('unique violation')),
      }),
    };
    await expect(
      trackFunnelEvent(
        'first_message_sent',
        undefined,
        rejectingClient,
        memoryStorage(),
      ),
    ).resolves.toBeUndefined();

    const brokenStorage: UtmStorage = {
      getItem: vi.fn(() => {
        throw new Error('storage blocked');
      }),
      setItem: vi.fn(),
    };
    const { client } = fakeClient();
    await expect(
      trackFunnelEvent('gift_sheet_open', undefined, client, brokenStorage),
    ).resolves.toBeUndefined();
  });
});
