import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { searchClosedOrders } from '../data/repositories/orderRepository';
import { scheduleBackgroundSync } from '../data/sync/engine';
import type { OrderErrorCode } from '../domain/errors';
import type { OrderSummary } from '../domain/models/orders';

export function useBillHistory(query: string): {
  orders: OrderSummary[];
  isLoading: boolean;
  errorCode: OrderErrorCode | null;
} {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) {
        setOrders([]);
        setIsLoading(false);
        return undefined;
      }

      let active = true;
      const loadLocal = () =>
        searchClosedOrders(tenantId, query).then((next) => {
          if (active) {
            setOrders(next);
            setErrorCode(null);
          }
        });

      void loadLocal()
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

      void scheduleBackgroundSync().then((didFull) => {
        if (active && didFull) {
          return loadLocal();
        }
        return undefined;
      });

      return () => {
        active = false;
      };
    }, [query, tenantId]),
  );

  return { orders, isLoading, errorCode };
}
