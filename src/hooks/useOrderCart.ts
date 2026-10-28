import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { listStock } from '../data/repositories/inventoryRepository';
import {
  addOrderItem,
  getOpenTableOrder,
  getOrCreateCounterOrder,
  getOrder,
  listFrequentItemIds,
  releaseEmptyOrder,
  removeOrderItemUnits,
  setOrderItemQuantity,
} from '../data/repositories/orderRepository';
import { OrderValidationError, orderErrorCode, type OrderErrorCode } from '../domain/errors';
import type { SaleOrder } from '../domain/models/orders';
import type { StockItem } from '../domain/models/inventory';

export type CartTarget =
  | { kind: 'table'; tableId: string }
  | { kind: 'counter' }
  | { kind: 'bill'; orderId: string };

export function useOrderCart(target: CartTarget): {
  order: SaleOrder | null;
  items: StockItem[];
  frequentItemIds: string[];
  isLoading: boolean;
  missing: boolean;
  busy: boolean;
  errorCode: OrderErrorCode | null;
  clearError: () => void;
  reload: () => Promise<void>;
  remember: (order: SaleOrder) => void;
  addByCode: (itemCode: string, quantity: number) => Promise<SaleOrder | null>;
  addItem: (itemId: string, quantity: number) => Promise<SaleOrder | null>;
  setQuantity: (lineId: string, quantity: number) => Promise<SaleOrder | null>;
  removeUnits: (itemId: string, quantity: number, preferLineId?: string) => Promise<SaleOrder | null>;
  release: () => Promise<boolean>;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const kind = target.kind;
  const tableId = target.kind === 'table' ? target.tableId : '';
  const billId = target.kind === 'bill' ? target.orderId : '';
  const pinnedId = useRef<string | null>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [frequentItemIds, setFrequentItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId || !actorId) {
      setOrder(null);
      setItems([]);
      setFrequentItemIds([]);
      setMissing(true);
      return;
    }

    const seen = revision.current;
    const [nextOrder, stock, frequentIds] = await Promise.all([
      loadTarget(kind, tableId, billId, tenantId, actorId, pinnedId.current),
      listStock(tenantId),
      listFrequentItemIds(tenantId, 40).catch(() => [] as string[]),
    ]);
    if (seen !== revision.current) {
      return;
    }
    if (nextOrder?.status === 'OPEN') {
      pinnedId.current = null;
    }
    setItems(stock);
    setFrequentItemIds(frequentIds);
    setOrder(nextOrder);
    setMissing(nextOrder === null);
    setErrorCode(null);
  }, [actorId, billId, kind, tableId, tenantId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setIsLoading(true);
      void reload()
        .catch(() => {
          if (active) {
            setErrorCode('unknown');
            setMissing(true);
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
    }, [reload]),
  );

  const runWrite = useCallback(
    async (write: () => Promise<SaleOrder | null>): Promise<{ ok: true; order: SaleOrder | null } | { ok: false }> => {
      if (pending.current) {
        return { ok: false };
      }
      pending.current = true;
      revision.current += 1;
      setBusy(true);
      setErrorCode(null);
      try {
        const next = await write();
        revision.current += 1;
        if (next) {
          if (next.status === 'OPEN') {
            pinnedId.current = null;
          }
          setOrder(next);
          setMissing(false);
        } else {
          pinnedId.current = null;
          setOrder(null);
          setMissing(true);
        }
        if (tenantId) {
          try {
            setItems(await listStock(tenantId));
          } catch {
            // The line is already saved. The next visit reloads stock.
          }
        }
        return { ok: true, order: next };
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return { ok: false };
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [tenantId],
  );

  const requireOpen = useCallback(() => {
    if (!tenantId || !actorId || !order) {
      throw new OrderValidationError('unknown');
    }
    if (order.status !== 'OPEN') {
      throw new OrderValidationError('closed');
    }
    return { tenantId, actorId, orderId: order.id };
  }, [actorId, order, tenantId]);

  const guardWrite = useCallback(
    async (
      write: (actor: { tenantId: string; actorId: string; orderId: string }) => Promise<SaleOrder | null>,
    ): Promise<SaleOrder | null> => {
      try {
        const actor = requireOpen();
        const result = await runWrite(() => write(actor));
        return result.ok ? result.order : null;
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return null;
      }
    },
    [requireOpen, runWrite],
  );

  const addByCode = useCallback(
    async (itemCode: string, quantity: number) => guardWrite((actor) => addOrderItem({ ...actor, itemCode, quantity })),
    [guardWrite],
  );

  const addItem = useCallback(
    async (itemId: string, quantity: number) => guardWrite((actor) => addOrderItem({ ...actor, itemId, quantity })),
    [guardWrite],
  );

  const setQuantity = useCallback(
    async (lineId: string, quantity: number) =>
      guardWrite((actor) => setOrderItemQuantity({ ...actor, lineId, quantity })),
    [guardWrite],
  );

  const removeUnits = useCallback(
    async (itemId: string, quantity: number, preferLineId?: string) =>
      guardWrite((actor) =>
        removeOrderItemUnits({ ...actor, itemId, quantity, preferLineId }),
      ),
    [guardWrite],
  );

  const release = useCallback(async () => {
    try {
      const actor = requireOpen();
      const result = await runWrite(async () => {
        await releaseEmptyOrder(actor);
        return null;
      });
      return result.ok;
    } catch (error) {
      setErrorCode(orderErrorCode(error));
      return false;
    }
  }, [requireOpen, runWrite]);

  const remember = useCallback((next: SaleOrder) => {
    revision.current += 1;
    pinnedId.current = next.id;
    setOrder(next);
    setMissing(false);
  }, []);

  return {
    order,
    items,
    frequentItemIds,
    isLoading,
    missing,
    busy,
    errorCode,
    clearError: () => setErrorCode(null),
    reload,
    remember,
    addByCode,
    addItem,
    setQuantity,
    removeUnits,
    release,
  };
}

async function loadTarget(
  kind: CartTarget['kind'],
  tableId: string,
  billId: string,
  tenantId: string,
  actorId: string,
  pinnedId: string | null,
): Promise<SaleOrder | null> {
  if (kind === 'counter') {
    if (pinnedId) {
      const pinned = await getOrder(tenantId, pinnedId);
      if (pinned.orderType === 'COUNTER' && pinned.status === 'PAID') {
        return pinned;
      }
    }
    return getOrCreateCounterOrder({ tenantId, actorId });
  }
  if (kind === 'bill') {
    return getOrder(tenantId, billId);
  }
  if (!/^\d{1,3}$/.test(tableId)) {
    return null;
  }
  const open = await getOpenTableOrder(tenantId, String(Number(tableId)));
  if (open) {
    return open;
  }
  if (!pinnedId) {
    return null;
  }
  const pinned = await getOrder(tenantId, pinnedId);
  return pinned.tableId === String(Number(tableId)) ? pinned : null;
}
