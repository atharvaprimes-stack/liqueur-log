import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { searchClosedOrders } from '../data/repositories/orderRepository';
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
      void searchClosedOrders(tenantId, query)
        .then((next) => {
          if (active) {
            setOrders(next);
            setErrorCode(null);
          }
        })
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
    }, [query, tenantId]),
  );

  return { orders, isLoading, errorCode };
}
