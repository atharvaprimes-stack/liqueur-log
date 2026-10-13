import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { correctItemStock, listStock, recordPurchase } from '../data/repositories/inventoryRepository';
import { InventoryAccessError, InventoryValidationError, inventoryErrorCode, type InventoryErrorCode } from '../domain/errors';
import { type PurchaseFormInput, type StockItem } from '../domain/models/inventory';

export function useInventory(): {
  items: StockItem[];
  isLoading: boolean;
  errorCode: InventoryErrorCode | null;
  isAdmin: boolean;
  correctStock: (itemId: string, nextStock: number) => Promise<void>;
  reload: () => Promise<void>;
  savePurchase: (form: PurchaseFormInput) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const isAdmin = currentUser?.role === 'ADMIN';
  const [items, setItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<InventoryErrorCode | null>(null);
  const revision = useRef(0);
  const pending = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

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

  const reload = useCallback(async () => {
    if (!tenantId) {
      return;
    }

    const seen = revision.current;
    try {
      const next = await listStock(tenantId);
      if (revision.current === seen) {
        setItems(next);
        setErrorCode(null);
      }
    } catch {
      if (revision.current === seen) {
        setErrorCode('unknown');
      }
    }
  }, [tenantId]);

  const correctStock = useCallback(
    async (itemId: string, nextStock: number) => {
      if (!isAdmin || !tenantId || !actorId) {
        throw new InventoryAccessError();
      }
      if (!Number.isInteger(nextStock) || nextStock < 0 || nextStock > 9999) {
        throw new InventoryValidationError('quantity');
      }
      if (pending.current) {
        throw new InventoryValidationError('unknown');
      }

      const currentItem = itemsRef.current.find((item) => item.id === itemId);
      if (!currentItem) {
        throw new InventoryValidationError('unknown-item');
      }
      if (currentItem.currentStock === nextStock) {
        return;
      }

      const previousStock = currentItem.currentStock;
      pending.current = true;
      revision.current += 1;
      setItems((current) => current.map((item) => (item.id === itemId ? { ...item, currentStock: nextStock } : item)));
      setErrorCode(null);

      try {
        const updated = await correctItemStock({ tenantId, actorId, itemId, nextStock });
        revision.current += 1;
        setItems((current) => current.map((item) => (item.id === itemId ? updated : item)));
      } catch (error) {
        revision.current += 1;
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, currentStock: previousStock } : item)),
        );
        setErrorCode(inventoryErrorCode(error));
        throw error;
      } finally {
        pending.current = false;
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

  return {
    items,
    isLoading,
    errorCode,
    isAdmin,
    correctStock,
    reload,
    savePurchase,
  };
}
