import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { loadDashboard } from '../data/repositories/dashboardRepository';
import { scheduleBackgroundSync } from '../data/sync/engine';
import { onLedgerUpdated } from '../data/sync/ledgerEvents';
import type { DashboardSnapshot } from '../domain/models/dashboard';

export function useDashboard(): {
  snapshot: DashboardSnapshot | null;
  isLoading: boolean;
  error: boolean;
  reload: () => Promise<void>;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const reloadLocal = useCallback(async () => {
    if (!tenantId) {
      setSnapshot(null);
      setError(false);
      return;
    }

    try {
      const next = await loadDashboard(tenantId);
      setSnapshot(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, [tenantId]);

  useEffect(() => onLedgerUpdated(() => {
    void reloadLocal().catch(() => undefined);
  }), [reloadLocal]);

  const reload = useCallback(async () => {
    await reloadLocal();
    if (!tenantId) {
      return;
    }
    const didFull = await scheduleBackgroundSync({ force: true });
    if (didFull) {
      await reloadLocal();
    }
  }, [reloadLocal, tenantId]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setSnapshot(null);
        setIsLoading(false);
        setError(false);
        return undefined;
      }

      let active = true;
      void reloadLocal()
        .catch(() => {
          if (active) {
            setError(true);
          }
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });

      void scheduleBackgroundSync().then((didFull) => {
        if (active && didFull) {
          return reloadLocal();
        }
        return undefined;
      });

      return () => {
        active = false;
      };
    }, [reloadLocal, tenantId]),
  );

  return { snapshot, isLoading, error, reload };
}
