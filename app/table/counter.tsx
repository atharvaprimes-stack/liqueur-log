import { OrderCartScreen } from '../../src/components/OrderCartScreen';

export default function CounterSaleScreen() {
  return <OrderCartScreen target={{ kind: 'counter' }} parent="/tables" />;
}
