import { useEffect, type ReactNode } from 'react';

import { syncAfterPeerNudge } from '../data/sync/engine';
import { subscribeLedgerNudges } from '../data/sync/peerNudge';
import { isSupabaseConfigured } from '../data/remote/supabaseClient';
import { useAuth } from './auth-context';

/**
 * While signed in, listen for peer ledger broadcasts and pull into SQLite.
 * Offline: subscription is idle; local writes + outbox continue unchanged.
 */
export function LedgerSyncProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;

  useEffect(() => {
    if (!tenantId || !isSupabaseConfigured()) {
      return undefined;
    }
    return subscribeLedgerNudges(tenantId, () => {
      syncAfterPeerNudge();
    });
  }, [tenantId]);

  return children;
}
