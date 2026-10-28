import type { RealtimeChannel } from '@supabase/supabase-js';

import { newId } from '../../security/id';
import { getSupabase, isSupabaseConfigured } from '../remote/supabaseClient';

const ORIGIN_ID = newId();
const EVENT = 'ledger_changed';

type NudgeHandler = () => void;

let activeTenantId: string | null = null;
let channel: RealtimeChannel | null = null;
let subscribeGeneration = 0;
const handlers = new Set<NudgeHandler>();

function topicFor(tenantId: string): string {
  return `ledger_nudge:${tenantId}`;
}

function notifyHandlers(): void {
  for (const handler of handlers) {
    try {
      handler();
    } catch (error) {
      console.warn('[sync] peer nudge handler failed', error);
    }
  }
}

async function attachChannel(tenantId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  if (channel && activeTenantId === tenantId) {
    return;
  }

  detachChannel();
  activeTenantId = tenantId;
  const generation = ++subscribeGeneration;
  const next = supabase.channel(topicFor(tenantId), {
    config: { broadcast: { self: false } },
  });

  next.on('broadcast', { event: EVENT }, ({ payload }) => {
    const origin = payload && typeof payload === 'object' ? (payload as { origin?: string }).origin : undefined;
    if (origin && origin === ORIGIN_ID) {
      return;
    }
    notifyHandlers();
  });

  channel = next;
  const status = await new Promise<string>((resolve) => {
    next.subscribe((value) => {
      if (value === 'SUBSCRIBED' || value === 'CHANNEL_ERROR' || value === 'TIMED_OUT' || value === 'CLOSED') {
        resolve(value);
      }
    });
  });

  if (generation !== subscribeGeneration || activeTenantId !== tenantId) {
    void supabase.removeChannel(next);
    return;
  }

  if (status !== 'SUBSCRIBED') {
    console.warn('[sync] ledger nudge channel status', status);
  }
}

function detachChannel(): void {
  subscribeGeneration += 1;
  const supabase = getSupabase();
  const previous = channel;
  channel = null;
  activeTenantId = null;
  if (previous && supabase) {
    void supabase.removeChannel(previous);
  }
}

/**
 * Keep a Realtime broadcast subscription for the signed-in tenant.
 * Offline-safe: no-ops when Supabase is unavailable; local writes still work.
 */
export function subscribeLedgerNudges(tenantId: string, onNudge: NudgeHandler): () => void {
  handlers.add(onNudge);
  void attachChannel(tenantId).catch((error) => {
    console.warn('[sync] ledger nudge subscribe failed', error);
  });

  return () => {
    handlers.delete(onNudge);
    if (handlers.size === 0) {
      detachChannel();
    }
  };
}

/** Tell peer devices a ledger push landed. No-op when offline / not subscribed. */
export function broadcastLedgerChanged(tenantId: string): void {
  if (!tenantId || !isSupabaseConfigured()) {
    return;
  }

  const payload = { origin: ORIGIN_ID, at: Date.now() };

  if (channel && activeTenantId === tenantId) {
    void channel
      .send({ type: 'broadcast', event: EVENT, payload })
      .catch((error) => console.warn('[sync] ledger nudge send failed', error));
    return;
  }

  // No long-lived subscriber on this device yet — open briefly to publish.
  void (async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const transient = supabase.channel(topicFor(tenantId), {
      config: { broadcast: { self: false } },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('nudge subscribe timeout')), 4000);
        transient.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timer);
            reject(new Error(status));
          }
        });
      });
      await transient.send({ type: 'broadcast', event: EVENT, payload });
    } catch (error) {
      console.warn('[sync] ledger nudge one-shot failed', error);
    } finally {
      void supabase.removeChannel(transient);
    }
  })();
}
