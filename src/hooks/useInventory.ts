import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { adjustItemStock, listStock, recordPurchase } from '../data/repositories/inventoryRepository';
import { InventoryAccessError, inventoryErrorCode, type InventoryErrorCode } from '../domain/errors';
import {
  filterStock,
  groupStock,
  type PurchaseFormInput,
  type StockItem,
  type StockSection,
} from '../domain/models/inventory';

export function useInventory(search = ''): {
  items: StockItem[];
  sections: StockSection[];
  isLoading: boolean;
  errorCode: InventoryErrorCode | null;
  isAdmin: boolean;
  adjustingId: string | null;
  adjustStock: (itemId: string, delta: 1 | -1) => Promise<void>;
  savePurchase: (form: PurchaseFormInput) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const isAdmin = currentUser?.role === 'ADMIN';
  const [items, setItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<InventoryErrorCode | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const revision = useRef(0);
  const adjusting = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setItems([]);
        setIsLoading(false);
        return undefined;
      }

      const seen = revision.current;
      let active = true;
      void listStock(tenantId)
        .then((next) => {
          if (active && revision.current === seen) {
            setItems(next);
            setErrorCode(null);
          }
        })
        .catch(() => {
          if (active && revision.current === seen) {
            setErrorCode('unknown');
          }
        })
        .finally(() => {
          if (active && revision.current === seen) {
            setIsLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [tenantId]),
  );

  const adjustStock = useCallback(
    async (itemId: string, delta: 1 | -1) => {
      if (!isAdmin || !tenantId || !actorId || adjusting.current || (delta !== 1 && delta !== -1)) {
        return;
      }

      adjusting.current = true;
      setAdjustingId(itemId);
      try {
        await adjustItemStock({ tenantId, actorId, itemId, delta });
        const next = await listStock(tenantId);
        revision.current += 1;
        setItems(next);
        setErrorCode(null);
      } catch (error) {
        setErrorCode(inventoryErrorCode(error));
      } finally {
        adjusting.current = false;
        setAdjustingId(null);
      }
    },
    [actorId, isAdmin, tenantId],
  );

  const savePurchase = useCallback(
    async (form: PurchaseFormInput) => {
      if (!isAdmin || !tenantId || !actorId) {
        throw new InventoryAccessError();
      }
      await recordPurchase(tenantId, actorId, form);
    },
    [actorId, isAdmin, tenantId],
  );

  const sections = useMemo(() => groupStock(filterStock(items, search)), [items, search]);

  return {
    items,
    sections,
    isLoading,
    errorCode,
    isAdmin,
    adjustingId,
    adjustStock,
    savePurchase,
  };
}
