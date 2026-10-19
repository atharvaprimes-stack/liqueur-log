import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';
import { listCatalogTerms, listStock } from '../data/repositories/inventoryRepository';
import { presentCatalogSheet } from '../domain/catalogSheet';
import type { ReportSheet } from '../domain/reports';
import type { StockItem } from '../domain/models/inventory';

export function useCatalogSheet(enabled: boolean): {
  sheet: ReportSheet | null;
  isLoading: boolean;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const { t, i18n } = useTranslation();
  const { currentUser, currentTenant } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [typeOrder, setTypeOrder] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const ticket = ++request.current;
    if (!enabled || !tenantId || !currentTenant) {
      setItems(null);
      setTypeOrder([]);
      setFailed(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [stock, types] = await Promise.all([listStock(tenantId), listCatalogTerms(tenantId, 'type')]);
      if (ticket !== request.current) {
        return;
      }
      setItems(stock);
      setTypeOrder(types.map((term) => term.name));
      setFailed(false);
      setIsLoading(false);
    } catch {
      if (ticket !== request.current) {
        return;
      }
      setFailed(true);
      setIsLoading(false);
    }
  }, [currentTenant, enabled, tenantId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sheet = useMemo(() => {
    if (!enabled || !currentTenant || items === null) {
      return null;
    }
    return presentCatalogSheet(
      items,
      typeOrder,
      {
        businessName: currentTenant.businessName,
        licenseNumber: currentTenant.licenseNumber,
        address: currentTenant.address,
      },
      (key, values) => String(t(key, values)),
      i18n.language,
    );
  }, [currentTenant, enabled, i18n.language, items, t, typeOrder]);

  return { sheet, isLoading, failed, reload: load };
}
