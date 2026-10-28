import { useCallback, useEffect, useRef, useState } from 'react';
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
import { onLedgerUpdated } from '../data/sync/ledgerEvents';
import { OrderValidationError, orderErrorCode, type OrderErrorCode } from '../domain/errors';
import type { SaleOrder } from '../domain/models/orders';
import { tracksStock, type ServiceStation, type StockItem } from '../domain/models/inventory';

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
  addByCode: (itemCode: string, quantity: number, serviceStation?: ServiceStation) => Promise<SaleOrder | null>;
  addItem: (itemId: string, quantity: number, serviceStation?: ServiceStation) => Promise<SaleOrder | null>;
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
  const orderRef = useRef<SaleOrder | null>(null);
  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [frequentItemIds, setFrequentItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  const rememberOrder = useCallback((next: SaleOrder | null) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const reload = useCallback(async () => {
    if (!tenantId || !actorId) {
      rememberOrder(null);
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
    rememberOrder(nextOrder);
    setMissing(nextOrder === null);
    setErrorCode(null);
  }, [actorId, billId, kind, rememberOrder, tableId, tenantId]);

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

  useEffect(
    () =>
      onLedgerUpdated(() => {
        if (pending.current) {
          return;
        }
        void reload().catch(() => undefined);
      }),
    [reload],
  );

  const refreshStock = useCallback(async () => {
    if (!tenantId) {
      return;
    }
    const seen = revision.current;
    try {
      const stock = await listStock(tenantId);
      if (seen === revision.current) {
        setItems(stock);
      }
    } catch {
      // The line is already saved. The next visit reloads stock.
    }
  }, [tenantId]);

  const runWrite = useCallback(
    async (write: () => Promise<SaleOrder | null>): Promise<{ ok: true; order: SaleOrder | null } | { ok: false }> => {
      if (pending.current) {
        return { ok: false };
      }
      pending.current = true;
      revision.current += 1;
      setBusy(true);
      setErrorCode(null);
      const before = orderRef.current;
      try {
        const next = await write();
        revision.current += 1;
        if (next) {
          if (next.status === 'OPEN') {
            pinnedId.current = null;
          }
          rememberOrder(next);
          setMissing(false);
          setItems((current) => applyStockDelta(current, before, next));
        } else {
          pinnedId.current = null;
          rememberOrder(null);
          setMissing(true);
          setItems((current) => applyStockDelta(current, before, null));
        }
        void refreshStock();
        return { ok: true, order: next };
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return { ok: false };
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [refreshStock, rememberOrder],
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
    async (itemCode: string, quantity: number, serviceStation?: ServiceStation) =>
      guardWrite((actor) => addOrderItem({ ...actor, itemCode, quantity, serviceStation })),
    [guardWrite],
  );

  const addItem = useCallback(
    async (itemId: string, quantity: number, serviceStation?: ServiceStation) =>
      guardWrite((actor) => addOrderItem({ ...actor, itemId, quantity, serviceStation })),
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

  const remember = useCallback(
    (next: SaleOrder) => {
      revision.current += 1;
      pinnedId.current = next.id;
      rememberOrder(next);
      setMissing(false);
    },
    [rememberOrder],
  );

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

function lineQtyByItem(order: SaleOrder | null): Map<string, number> {
  const qty = new Map<string, number>();
  for (const line of order?.lines ?? []) {
    qty.set(line.itemId, (qty.get(line.itemId) ?? 0) + line.quantity);
  }
  return qty;
}

/** Stock on hand moves opposite to open-order quantity. */
function applyStockDelta(items: StockItem[], before: SaleOrder | null, after: SaleOrder | null): StockItem[] {
  const prev = lineQtyByItem(before);
  const next = lineQtyByItem(after);
  const touched = new Set<string>([...prev.keys(), ...next.keys()]);
  if (touched.size === 0) {
    return items;
  }
  return items.map((item) => {
    if (!touched.has(item.id) || !tracksStock(item)) {
      return item;
    }
    const delta = (prev.get(item.id) ?? 0) - (next.get(item.id) ?? 0);
    if (delta === 0) {
      return item;
    }
    return { ...item, currentStock: item.currentStock + delta };
  });
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
