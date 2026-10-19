import { useLocalSearchParams } from 'expo-router';

import { OrderCartScreen } from '../../../src/components/OrderCartScreen';

export default function ClosedBillScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; returnTo?: string | string[] }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const requested = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const parent = requested === '/reports' || requested === '/table/history' ? requested : '/tables';
  return <OrderCartScreen target={{ kind: 'bill', orderId }} parent={parent} />;
}
