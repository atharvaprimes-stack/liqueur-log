import { useLocalSearchParams } from 'expo-router';

import { OrderCartScreen } from '../../src/components/OrderCartScreen';

export default function TableOrderScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const tableId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  return <OrderCartScreen target={{ kind: 'table', tableId }} parent="/tables" />;
}
