import type { OrderStatus, OrderType } from './orders';

export type DashboardSeller = {
  itemId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  quantity: number;
  amount: number;
};

export type DashboardSalesPoint = {
  /** Bucket key: `YYYY-MM-DD` for last-7-days, or `YYYY-MM` for last-12-months. */
  bucket: string;
  amount: number;
};

export type DashboardRecentOrder = {
  id: string;
  sequence: string;
  tableId: string | null;
  orderType: OrderType;
  status: OrderStatus;
  isCredit: boolean;
  totalAmount: number;
  createdAt: number;
  closedAt: number | null;
  staffName: string;
};

export type DashboardSnapshot = {
  todaySales: number;
  todayOrders: number;
  monthSales: number;
  monthOrders: number;
  todayCollected: number;
  todayUnits: number;
  todayPurchases: number;
  occupiedTables: number;
  tableCount: number;
  openTabs: number;
  openFloorSales: number;
  itemCount: number;
  lowCount: number;
  outCount: number;
  creditDue: number;
  topSellers: DashboardSeller[];
  /** Day buckets for the trailing 7 calendar days (Mon…Sun labels in UI). */
  salesLast7Days: DashboardSalesPoint[];
  /** Month buckets for the trailing 12 months (Jan…Dec labels in UI). */
  salesLast12Months: DashboardSalesPoint[];
  recentOrders: DashboardRecentOrder[];
};
