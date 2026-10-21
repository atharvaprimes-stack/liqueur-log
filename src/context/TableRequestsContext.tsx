import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  closeTableRequestsRemote,
  listTableRequestsRemote,
  parseTableRequest,
  updateTableRequestStatusRemote,
  updateTableRequestsStatusBulkRemote,
} from '../data/remote/tableRequestsRemote';
import { getSupabase, isSupabaseConfigured } from '../data/remote/supabaseClient';
import {
  normalizeTableId,
  pendingRequestsForTable,
  summarizePendingByTable,
  type TableRequest,
  type TableRequestSummary,
} from '../domain/models/tableRequests';
import {
  notifyIncomingTableRequest,
  registerTableRequestPushToken,
} from '../notifications/tableRequestAlerts';
import { useAuth } from './auth-context';

const ACTIVE_STATUSES = new Set(['pending', 'accepted', 'rejected']);

function upsertRequest(list: TableRequest[], next: TableRequest): TableRequest[] {
  const without = list.filter((request) => request.id !== next.id);
  if (!ACTIVE_STATUSES.has(next.status)) {
    return without;
  }
  return [...without, next].sort((left, right) => left.createdAt - right.createdAt);
}

export type TableRequestsContextValue = {
  requests: TableRequest[];
  pendingByTable: Map<string, TableRequestSummary>;
  pendingForTable: (tableId: string) => TableRequest[];
  summaryForTable: (tableId: string) => TableRequestSummary | null;
  isListening: boolean;
  acceptRequest: (requestId: string) => Promise<boolean>;
  rejectRequest: (requestId: string) => Promise<boolean>;
  acceptRequests: (requestIds: string[]) => Promise<boolean>;
  closeForTable: (tableId: string) => Promise<boolean>;
};

const TableRequestsContext = createContext<TableRequestsContextValue | null>(null);

export function TableRequestsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [isListening, setIsListening] = useState(false);
  const seenIdsRef = useRef(new Set<string>());

  const applyRemoteRow = useCallback(
    (raw: unknown, options?: { alert?: boolean }) => {
      const parsed = parseTableRequest(raw);
      if (!parsed || (tenantId && parsed.tenantId !== tenantId)) {
        return;
      }

      const isNew = !seenIdsRef.current.has(parsed.id);
      seenIdsRef.current.add(parsed.id);
      setRequests((current) => upsertRequest(current, parsed));

      if (options?.alert && isNew && parsed.status === 'pending') {
        void notifyIncomingTableRequest(parsed);
      }
    },
    [tenantId],
  );

  const reload = useCallback(async () => {
    if (!tenantId || !isSupabaseConfigured()) {
      setRequests([]);
      return;
    }
    const listed = await listTableRequestsRemote(tenantId);
    if (!listed) {
      return;
    }
    const next = listed
      .filter((request) => request.tenantId === tenantId && ACTIVE_STATUSES.has(request.status))
      .sort((left, right) => left.createdAt - right.createdAt);
    seenIdsRef.current = new Set(next.map((request) => request.id));
    setRequests(next);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !isSupabaseConfigured()) {
      setRequests([]);
      setIsListening(false);
      seenIdsRef.current = new Set();
      return undefined;
    }

    let cancelled = false;
    void reload();
    void registerTableRequestPushToken(tenantId);

    const supabase = getSupabase();
    if (!supabase) {
      setIsListening(false);
      return undefined;
    }

    // Unique topic per effect run so React Strict Mode remounts (and any stale
    // removeChannel) never call .on() on an already-subscribed channel object.
    const channel = supabase
      .channel(`table_requests:${tenantId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'table_requests',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (!cancelled) {
            applyRemoteRow(payload.new, { alert: true });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'table_requests',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (!cancelled) {
            applyRemoteRow(payload.new);
          }
        },
      )
      .subscribe((status) => {
        if (!cancelled) {
          setIsListening(status === 'SUBSCRIBED');
        }
      });

    return () => {
      cancelled = true;
      setIsListening(false);
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteRow, reload, tenantId]);

  const pendingByTable = useMemo(() => summarizePendingByTable(requests), [requests]);

  const pendingForTable = useCallback(
    (tableId: string) => pendingRequestsForTable(requests, tableId),
    [requests],
  );

  const summaryForTable = useCallback(
    (tableId: string) => pendingByTable.get(normalizeTableId(tableId)) ?? null,
    [pendingByTable],
  );

  const patchLocalStatus = useCallback((ids: string[], status: TableRequest['status']) => {
    setRequests((current) => {
      let changed = false;
      const next = current.flatMap((request) => {
        if (!ids.includes(request.id)) {
          return [request];
        }
        changed = true;
        if (!ACTIVE_STATUSES.has(status)) {
          return [];
        }
        return [{ ...request, status, updatedAt: Date.now() }];
      });
      return changed ? next : current;
    });
  }, []);

  const acceptRequest = useCallback(
    async (requestId: string) => {
      const ok = await updateTableRequestStatusRemote(requestId, 'accepted');
      // Always clear from Incoming Requests after staff accepts into the cart.
      patchLocalStatus([requestId], 'accepted');
      return ok;
    },
    [patchLocalStatus],
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      const ok = await updateTableRequestStatusRemote(requestId, 'rejected');
      if (ok) {
        patchLocalStatus([requestId], 'rejected');
      }
      return ok;
    },
    [patchLocalStatus],
  );

  const acceptRequests = useCallback(
    async (requestIds: string[]) => {
      if (requestIds.length === 0) {
        return true;
      }
      const ok = await updateTableRequestsStatusBulkRemote(requestIds, 'accepted');
      patchLocalStatus(requestIds, 'accepted');
      return ok;
    },
    [patchLocalStatus],
  );

  const closeForTable = useCallback(
    async (tableId: string) => {
      const normalized = normalizeTableId(tableId);
      const ok = await closeTableRequestsRemote(normalized, tenantId);
      if (ok) {
        setRequests((current) =>
          current.filter((request) => normalizeTableId(request.tableId) !== normalized),
        );
      }
      return ok;
    },
    [tenantId],
  );

  const value = useMemo(
    (): TableRequestsContextValue => ({
      requests,
      pendingByTable,
      pendingForTable,
      summaryForTable,
      isListening,
      acceptRequest,
      rejectRequest,
      acceptRequests,
      closeForTable,
    }),
    [
      acceptRequest,
      acceptRequests,
      closeForTable,
      isListening,
      pendingByTable,
      pendingForTable,
      rejectRequest,
      requests,
      summaryForTable,
    ],
  );

  return <TableRequestsContext.Provider value={value}>{children}</TableRequestsContext.Provider>;
}

export function useTableRequests(): TableRequestsContextValue {
  const value = useContext(TableRequestsContext);
  if (!value) {
    throw new Error('useTableRequests must be used within a TableRequestsProvider.');
  }
  return value;
}
