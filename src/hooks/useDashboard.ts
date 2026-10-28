import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { loadDashboard } from '../data/repositories/dashboardRepository';
import { syncNow } from '../data/sync/engine';
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

  const reload = useCallback(async () => {
    if (!tenantId) {
      setSnapshot(null);
      setError(false);
      return;
    }

    try {
      await syncNow().catch(() => undefined);
      const next = await loadDashboard(tenantId);
      setSnapshot(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setSnapshot(null);
        setIsLoading(false);
        setError(false);
        return undefined;
      }

      let active = true;
      void reload().finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

      return () => {
        active = false;
      };
    }, [reload, tenantId]),
  );

  return { snapshot, isLoading, error, reload };
}
