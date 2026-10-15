import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import {
  createCatalogItem,
  createVendor,
  deleteCatalogItem,
  deleteCatalogTerm,
  deleteVendor,
  listCatalogTerms,
  listStock,
  listVendors,
  saveCatalogTerm,
  updateCatalogItem,
  updateVendor,
  type CatalogTermKind,
} from '../data/repositories/inventoryRepository';
import { InventoryAccessError, type InventoryErrorCode } from '../domain/errors';
import {
  type CatalogItemInput,
  type CatalogTerm,
  type StockItem,
  type Vendor,
  type VendorInput,
} from '../domain/models/inventory';

export function useCatalog(): {
  items: StockItem[];
  vendors: Vendor[];
  itemTypes: CatalogTerm[];
  itemStrengths: CatalogTerm[];
  isLoading: boolean;
  errorCode: InventoryErrorCode | null;
  isAdmin: boolean;
  saveItem: (itemId: string | null, item: CatalogItemInput) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  saveVendor: (vendorId: string | null, vendor: VendorInput) => Promise<void>;
  removeVendor: (vendorId: string) => Promise<void>;
  saveTerm: (kind: CatalogTermKind, termId: string | null, name: string) => Promise<void>;
  removeTerm: (kind: CatalogTermKind, termId: string) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const isAdmin = currentUser?.role === 'ADMIN';
  const [items, setItems] = useState<StockItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [itemTypes, setItemTypes] = useState<CatalogTerm[]>([]);
  const [itemStrengths, setItemStrengths] = useState<CatalogTerm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<InventoryErrorCode | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId) {
      setItems([]);
      setVendors([]);
      setItemTypes([]);
      setItemStrengths([]);
      return;
    }
    const [nextItems, nextVendors, nextTypes, nextStrengths] = await Promise.all([
      listStock(tenantId),
      listVendors(tenantId),
      listCatalogTerms(tenantId, 'type'),
      listCatalogTerms(tenantId, 'strength'),
    ]);
    setItems(nextItems);
    setVendors(nextVendors);
    setItemTypes(nextTypes);
    setItemStrengths(nextStrengths);
    setErrorCode(null);
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setItems([]);
        setVendors([]);
        setItemTypes([]);
        setItemStrengths([]);
        setIsLoading(false);
        return undefined;
      }

      let active = true;
      setIsLoading(true);
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

  const requireActor = useCallback(() => {
    if (!isAdmin || !tenantId || !actorId) {
      throw new InventoryAccessError();
    }
    return { tenantId, actorId };
  }, [actorId, isAdmin, tenantId]);

  const saveItem = useCallback(
    async (itemId: string | null, item: CatalogItemInput) => {
      const actor = requireActor();
      if (itemId) {
        await updateCatalogItem({ ...actor, itemId, item });
      } else {
        await createCatalogItem({ ...actor, item });
      }
      await reload();
    },
    [reload, requireActor],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const actor = requireActor();
      await deleteCatalogItem({ ...actor, itemId });
      await reload();
    },
    [reload, requireActor],
  );

  const saveVendor = useCallback(
    async (vendorId: string | null, vendor: VendorInput) => {
      const actor = requireActor();
      if (vendorId) {
        await updateVendor({ ...actor, vendorId, vendor });
      } else {
        await createVendor({ ...actor, vendor });
      }
      await reload();
    },
    [reload, requireActor],
  );

  const removeVendor = useCallback(
    async (vendorId: string) => {
      const actor = requireActor();
      await deleteVendor({ ...actor, vendorId });
      await reload();
    },
    [reload, requireActor],
  );

  const saveTerm = useCallback(
    async (kind: CatalogTermKind, termId: string | null, name: string) => {
      const actor = requireActor();
      await saveCatalogTerm({ ...actor, kind, termId, name });
      await reload();
    },
    [reload, requireActor],
  );

  const removeTerm = useCallback(
    async (kind: CatalogTermKind, termId: string) => {
      const actor = requireActor();
      await deleteCatalogTerm({ ...actor, kind, termId });
      await reload();
    },
    [reload, requireActor],
  );

  return {
    items,
    vendors,
    itemTypes,
    itemStrengths,
    isLoading,
    errorCode,
    isAdmin,
    saveItem,
    removeItem,
    saveVendor,
    removeVendor,
    saveTerm,
    removeTerm,
  };
}

export function useVendors(): { vendors: Vendor[]; isLoading: boolean } {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setVendors([]);
        setIsLoading(false);
        return undefined;
      }

      let active = true;
      void listVendors(tenantId)
        .then((next) => {
          if (active) {
            setVendors(next);
          }
        })
        .catch(() => {
          if (active) {
            setVendors([]);
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
    }, [tenantId]),
  );

  return { vendors, isLoading };
}
