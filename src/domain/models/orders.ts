import type { ServiceStation } from './inventory';

export const ORDER_TYPES = ['TABLE', 'COUNTER'] as const;
export const ORDER_STATUSES = ['OPEN', 'PAID'] as const;
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Split', 'Other'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type { ServiceStation };

export type OrderLine = {
  id: string;
  itemId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  liquorType: string;
  serviceStation: ServiceStation;
  volumeMl: number;
  quantity: number;
  unitPrice: number;
};

export type OrderSummary = {
  id: string;
  tenantId: string;
  tableId: string | null;
  orderType: OrderType;
  status: OrderStatus;
  totalAmount: number;
  paidAmount: number;
  cashAmount: number;
  upiAmount: number;
  paymentMethod: PaymentMethod | null;
  isCredit: boolean;
  sequence: string;
  createdAt: number;
  closedAt: number | null;
  /** Total units on the order (sum of line quantities). */
  itemCount: number;
};

/** Full settlement from independent Cash + UPI amounts. */
export function deriveSettlement(
  cashAmount: number,
  upiAmount: number,
  totalAmount: number,
): { method: PaymentMethod; paidAmount: number; cashAmount: number; upiAmount: number } | null {
  const cashPaise = Math.round(cashAmount * 100);
  const upiPaise = Math.round(upiAmount * 100);
  const totalPaise = Math.round(totalAmount * 100);
  if (
    !Number.isInteger(cashPaise) ||
    !Number.isInteger(upiPaise) ||
    cashPaise < 0 ||
    upiPaise < 0 ||
    cashPaise + upiPaise !== totalPaise
  ) {
    return null;
  }
  const method: PaymentMethod =
    cashPaise > 0 && upiPaise > 0 ? 'Split' : cashPaise > 0 ? 'Cash' : 'UPI';
  return {
    method,
    paidAmount: totalPaise / 100,
    cashAmount: cashPaise / 100,
    upiAmount: upiPaise / 100,
  };
}

export type SaleOrder = OrderSummary & {
  lines: OrderLine[];
};

export type FloorTable = {
  number: string;
  order: OrderSummary | null;
  /** Guest QR requests awaiting staff review (0 when none / feature idle). */
  pendingRequestCount: number;
};

export function isOrderType(value: string): value is OrderType {
  return ORDER_TYPES.some((type) => type === value);
}

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.some((status) => status === value);
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method === value);
}

export function balancePaise(totalAmount: number, paidAmount: number): number {
  return Math.max(Math.round(totalAmount * 100) - Math.round(paidAmount * 100), 0);
}

export function floorTables(tableCount: number, openOrders: OrderSummary[]): FloorTable[] {
  const byTable = new Map<string, OrderSummary>();
  for (const order of openOrders) {
    if (order.orderType === 'TABLE' && order.tableId) {
      byTable.set(order.tableId, order);
    }
  }

  const count = Number.isInteger(tableCount) && tableCount > 0 ? tableCount : 0;
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1));
  const extras = [...byTable.keys()]
    .filter((number) => {
      const value = Number(number);
      return !Number.isInteger(value) || value < 1 || value > count;
    })
    .sort((left, right) => Number(left) - Number(right));

  return [...numbers, ...extras].map((number) => ({
    number,
    order: byTable.get(number) ?? null,
    pendingRequestCount: 0,
  }));
}

export function openCounterOrder(openOrders: OrderSummary[]): OrderSummary | null {
  return openOrders.find((order) => order.orderType === 'COUNTER') ?? null;
}
