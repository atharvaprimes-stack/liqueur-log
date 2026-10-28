import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { loadFloor, startTableSession } from '../data/repositories/orderRepository';
import { syncNow } from '../data/sync/engine';
import { OrderValidationError, type OrderErrorCode } from '../domain/errors';
import { floorTables, openCounterOrder, type FloorTable, type OrderSummary } from '../domain/models/orders';

export function useFloor(): {
  tables: FloorTable[];
  counter: OrderSummary | null;
  isLoading: boolean;
  errorCode: OrderErrorCode | null;
  startTable: (tableNumber: string) => Promise<OrderSummary>;
} {
  const { currentUser, currentTenant } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const [tableCount, setTableCount] = useState(currentTenant?.tableCount ?? 0);
  const [openOrders, setOpenOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId) {
      setTableCount(0);
      setOpenOrders([]);
      return;
    }
    await syncNow().catch(() => undefined);
    const floor = await loadFloor(tenantId);
    setTableCount(floor.tableCount);
    setOpenOrders(floor.openOrders);
    setErrorCode(null);
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setTableCount(0);
        setOpenOrders([]);
        setIsLoading(false);
        return undefined;
      }

      let active = true;
      void reload()
        .catch(() => {
          if (active) {
            setErrorCode('unknown');
          }
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [reload, tenantId]),
  );

  const startTable = useCallback(
    async (tableNumber: string) => {
      if (!tenantId || !actorId) {
        throw new OrderValidationError('unknown');
      }
      const order = await startTableSession({ tenantId, actorId, tableNumber });
      await reload();
      return order;
    },
    [actorId, reload, tenantId],
  );

  const tables = useMemo(() => floorTables(tableCount, openOrders), [openOrders, tableCount]);
  const counter = useMemo(() => openCounterOrder(openOrders), [openOrders]);

  return { tables, counter, isLoading, errorCode, startTable };
}
