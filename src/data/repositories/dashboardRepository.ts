import { withDatabase } from '../local/database';
import {
  eachDateKey,
  eachMonthKey,
  last12MonthsRange,
  monthRange,
  rangeBounds,
  todayRange,
  weekRange,
  type DateRange,
} from '../../domain/dates';
import type {
  DashboardRecentOrder,
  DashboardSalesPoint,
  DashboardSeller,
  DashboardSnapshot,
} from '../../domain/models/dashboard';
import type { OrderStatus, OrderType } from '../../domain/models/orders';

type SalesRow = {
  today_sales: number | null;
  today_orders: number | null;
  today_collected: number | null;
  month_sales: number | null;
  month_orders: number | null;
};

type ActivityRow = {
  occupied: number | null;
  open_tabs: number | null;
  open_floor_sales: number | null;
  credit_due: number | null;
};

type StockRow = {
  item_count: number | null;
  low_count: number | null;
  out_count: number | null;
};

type SellerRow = {
  item_id: string;
  item_code: string;
  name_en: string;
  name_mr: string;
  quantity: number | null;
  amount: number | null;
};

type SeriesRow = {
  bucket: string | null;
  amount: number | null;
};

type RecentRow = {
  id: string;
  sequence: string;
  table_id: string | null;
  order_type: string;
  status: string;
  is_credit: number | null;
  total_amount: number | null;
  created_at: number | null;
  closed_at: number | null;
  staff_name: string | null;
};

export async function loadDashboard(tenantId: string): Promise<DashboardSnapshot> {
  const now = new Date();
  const today = bounds(todayRange(now));
  const month = bounds(monthRange(now));
  const days7 = bounds(weekRange(now));
  const months12 = bounds(last12MonthsRange(now));

  return withDatabase(async (database) => {
    const sales = await database.getFirstAsync<SalesRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN closed_at >= ? AND closed_at < ? THEN total_amount END), 0) AS today_sales,
         COALESCE(SUM(CASE WHEN closed_at >= ? AND closed_at < ? THEN 1 END), 0) AS today_orders,
         COALESCE(SUM(CASE WHEN closed_at >= ? AND closed_at < ? THEN paid_amount END), 0) AS today_collected,
         COALESCE(SUM(CASE WHEN closed_at >= ? AND closed_at < ? THEN total_amount END), 0) AS month_sales,
         COALESCE(SUM(CASE WHEN closed_at >= ? AND closed_at < ? THEN 1 END), 0) AS month_orders
       FROM orders
       WHERE tenant_id = ? AND status = 'PAID'`,
      [
        today.start,
        today.end,
        today.start,
        today.end,
        today.start,
        today.end,
        month.start,
        month.end,
        month.start,
        month.end,
        tenantId,
      ],
    );

    const activity = await database.getFirstAsync<ActivityRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'OPEN' AND order_type = 'TABLE' THEN 1 ELSE 0 END), 0) AS occupied,
         COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_tabs,
         COALESCE(SUM(CASE WHEN status = 'OPEN' THEN total_amount ELSE 0 END), 0) AS open_floor_sales,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND is_credit = 1 THEN total_amount - paid_amount ELSE 0 END), 0) AS credit_due
       FROM orders
       WHERE tenant_id = ?`,
      [tenantId],
    );

    const stock = await database.getFirstAsync<StockRow>(
      `SELECT
         COUNT(*) AS item_count,
         COALESCE(SUM(CASE
           WHEN tracks_stock = 1
            AND current_stock > 0
            AND current_stock <= low_stock_threshold
           THEN 1 ELSE 0 END), 0) AS low_count,
         COALESCE(SUM(CASE
           WHEN tracks_stock = 1 AND current_stock = 0
           THEN 1 ELSE 0 END), 0) AS out_count
       FROM items
       WHERE tenant_id = ?`,
      [tenantId],
    );

    const tenant = await database.getFirstAsync<{ table_count: number | null }>(
      'SELECT table_count FROM tenants WHERE id = ?',
      [tenantId],
    );
    const purchases = await database.getFirstAsync<{ today_purchases: number | null }>(
      `SELECT COALESCE(SUM(total_amount), 0) AS today_purchases
       FROM purchases
       WHERE tenant_id = ? AND purchase_date >= ? AND purchase_date < ?`,
      [tenantId, today.start, today.end],
    );
    const units = await database.getFirstAsync<{ today_units: number | null }>(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS today_units
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.tenant_id = ? AND o.status = 'PAID' AND o.closed_at >= ? AND o.closed_at < ?`,
      [tenantId, today.start, today.end],
    );
    const topSellers = await database.getAllAsync<SellerRow>(
      `SELECT
         oi.item_id AS item_id,
         MIN(oi.item_code) AS item_code,
         MIN(oi.name_en) AS name_en,
         MIN(oi.name_mr) AS name_mr,
         SUM(oi.quantity) AS quantity,
         SUM(oi.quantity * oi.unit_price) AS amount
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.tenant_id = ? AND o.status = 'PAID' AND o.closed_at >= ? AND o.closed_at < ?
       GROUP BY oi.item_id
       ORDER BY quantity DESC, amount DESC
       LIMIT 5`,
      [tenantId, today.start, today.end],
    );

    const last7Rows = await database.getAllAsync<SeriesRow>(
      `SELECT
         strftime('%Y-%m-%d', closed_at / 1000, 'unixepoch', 'localtime') AS bucket,
         COALESCE(SUM(total_amount), 0) AS amount
       FROM orders
       WHERE tenant_id = ? AND status = 'PAID' AND closed_at >= ? AND closed_at < ?
       GROUP BY bucket
       ORDER BY bucket`,
      [tenantId, days7.start, days7.end],
    );
    const last12Rows = await database.getAllAsync<SeriesRow>(
      `SELECT
         strftime('%Y-%m', closed_at / 1000, 'unixepoch', 'localtime') AS bucket,
         COALESCE(SUM(total_amount), 0) AS amount
       FROM orders
       WHERE tenant_id = ? AND status = 'PAID' AND closed_at >= ? AND closed_at < ?
       GROUP BY bucket
       ORDER BY bucket`,
      [tenantId, months12.start, months12.end],
    );

    const recentRows = await database.getAllAsync<RecentRow>(
      `SELECT
         o.id AS id,
         o.order_sequence_string AS sequence,
         o.table_id AS table_id,
         o.order_type AS order_type,
         o.status AS status,
         o.is_credit AS is_credit,
         o.total_amount AS total_amount,
         o.created_at AS created_at,
         o.closed_at AS closed_at,
         COALESCE(u.name, '') AS staff_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.created_by
       WHERE o.tenant_id = ?
         AND o.created_at >= ?
         AND o.created_at < ?
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [tenantId, today.start, today.end],
    );

    return {
      todaySales: money(sales?.today_sales),
      todayOrders: count(sales?.today_orders),
      monthSales: money(sales?.month_sales),
      monthOrders: count(sales?.month_orders),
      todayCollected: money(sales?.today_collected),
      todayUnits: count(units?.today_units),
      todayPurchases: money(purchases?.today_purchases),
      occupiedTables: count(activity?.occupied),
      tableCount: count(tenant?.table_count),
      openTabs: count(activity?.open_tabs),
      openFloorSales: money(activity?.open_floor_sales),
      itemCount: count(stock?.item_count),
      lowCount: count(stock?.low_count),
      outCount: count(stock?.out_count),
      creditDue: money(activity?.credit_due),
      topSellers: topSellers.map(mapSeller),
      salesLast7Days: fillDailySeries(weekRange(now), last7Rows),
      salesLast12Months: fillMonthlySeries(now, last12Rows),
      recentOrders: recentRows.map(mapRecent),
    };
  });
}

function fillDailySeries(range: DateRange, rows: SeriesRow[]): DashboardSalesPoint[] {
  const amounts = seriesMap(rows);
  return eachDateKey(range).map((bucket) => ({
    bucket,
    amount: amounts.get(bucket) ?? 0,
  }));
}

function fillMonthlySeries(now: Date, rows: SeriesRow[]): DashboardSalesPoint[] {
  const amounts = seriesMap(rows);
  return eachMonthKey(now).map((bucket) => ({
    bucket,
    amount: amounts.get(bucket) ?? 0,
  }));
}

function seriesMap(rows: SeriesRow[]): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.bucket) {
      continue;
    }
    amounts.set(row.bucket, money(row.amount));
  }
  return amounts;
}

function bounds(range: DateRange): { start: number; end: number } {
  return rangeBounds(range) ?? { start: 0, end: 0 };
}

function money(value: number | null | undefined): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function count(value: number | null | undefined): number {
  return Math.max(0, Math.round(money(value)));
}

function mapSeller(row: SellerRow): DashboardSeller {
  return {
    itemId: row.item_id,
    itemCode: row.item_code,
    nameEn: row.name_en,
    nameMr: row.name_mr,
    quantity: count(row.quantity),
    amount: money(row.amount),
  };
}

function mapRecent(row: RecentRow): DashboardRecentOrder {
  const orderType: OrderType = row.order_type === 'COUNTER' ? 'COUNTER' : 'TABLE';
  const status: OrderStatus = row.status === 'PAID' ? 'PAID' : 'OPEN';
  return {
    id: row.id,
    sequence: row.sequence,
    tableId: row.table_id,
    orderType,
    status,
    isCredit: Boolean(row.is_credit),
    totalAmount: money(row.total_amount),
    createdAt: count(row.created_at),
    closedAt: row.closed_at == null ? null : count(row.closed_at),
    staffName: row.staff_name?.trim() || '',
  };
}
