import { withDatabase } from '../local/database';
import type {
  MovementRow,
  PurchaseDayRow,
  PurchaseLineRow,
  ReportBounds,
  ReportSource,
  SalesDayRow,
} from '../../domain/reports';
import { resolveServiceStation, type StockItem } from '../../domain/models/inventory';

const ITEM_COLUMNS = `id, tenant_id, serial_no, item_code, name_en, name_mr, brand, liquor_type, sub_type,
  service_station, volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold`;

type ItemRow = {
  id: string;
  tenant_id: string;
  serial_no: number;
  item_code: string;
  name_en: string;
  name_mr: string;
  brand: string;
  liquor_type: string;
  sub_type: string;
  service_station: string;
  volume_ml: number;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  low_stock_threshold: number;
};

type MovementSqlRow = {
  day: string;
  item_id: string;
  item_code: string;
  name_en: string;
  name_mr: string;
  liquor_type: string;
  volume_ml: number;
  quantity: number;
  amount: number;
  unit_price: number;
  staff_name?: string | null;
};

type PurchaseSqlRow = MovementSqlRow & {
  supplier_name: string;
  invoice_number: string;
};

type SalesDaySqlRow = {
  day: string;
  bill_count: number;
  sales_amount: number;
  cash_amount: number;
  upi_amount: number;
  other_amount: number;
  credit_amount: number;
};

type PurchaseDaySqlRow = {
  day: string;
  invoice_count: number;
  purchase_amount: number;
  purchase_credit: number;
};

function localDay(column: string): string {
  return `strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch', 'localtime')`;
}

export async function loadReportSource(tenantId: string, bounds: ReportBounds): Promise<ReportSource> {
  return withDatabase(async (database) => {
    const salesLines = await database.getAllAsync<MovementSqlRow>(
      `SELECT ${localDay('o.closed_at')} AS day,
              oi.item_id AS item_id,
              oi.item_code AS item_code,
              oi.name_en AS name_en,
              oi.name_mr AS name_mr,
              oi.liquor_type AS liquor_type,
              oi.volume_ml AS volume_ml,
              oi.unit_price AS unit_price,
              COALESCE(u.name, '') AS staff_name,
              SUM(oi.quantity) AS quantity,
              SUM(oi.quantity * oi.unit_price) AS amount
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN users u ON u.id = o.created_by
       WHERE o.tenant_id = ?
         AND o.status = 'PAID'
         AND o.closed_at >= ?
         AND o.closed_at < ?
       GROUP BY day, oi.item_id, oi.item_code, oi.name_en, oi.name_mr, oi.liquor_type, oi.volume_ml, oi.unit_price, o.created_by, u.name
       ORDER BY day ASC, oi.name_en COLLATE NOCASE ASC, u.name COLLATE NOCASE ASC`,
      [tenantId, bounds.from, bounds.until],
    );
    const salesDays = await database.getAllAsync<SalesDaySqlRow>(
      `SELECT ${localDay('closed_at')} AS day,
              COUNT(*) AS bill_count,
              COALESCE(SUM(total_amount), 0) AS sales_amount,
              COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN paid_amount ELSE 0 END), 0) AS cash_amount,
              COALESCE(SUM(CASE WHEN payment_method = 'UPI' THEN paid_amount ELSE 0 END), 0) AS upi_amount,
              COALESCE(SUM(CASE WHEN payment_method = 'Other' THEN paid_amount ELSE 0 END), 0) AS other_amount,
              COALESCE(SUM(total_amount - paid_amount), 0) AS credit_amount
       FROM orders
       WHERE tenant_id = ?
         AND status = 'PAID'
         AND closed_at >= ?
         AND closed_at < ?
       GROUP BY day
       ORDER BY day ASC`,
      [tenantId, bounds.from, bounds.until],
    );
    const purchaseLines = await database.getAllAsync<PurchaseSqlRow>(
      `SELECT ${localDay('p.purchase_date')} AS day,
              p.supplier_name AS supplier_name,
              p.invoice_number AS invoice_number,
              pi.item_id AS item_id,
              i.item_code AS item_code,
              i.name_en AS name_en,
              i.name_mr AS name_mr,
              i.liquor_type AS liquor_type,
              i.volume_ml AS volume_ml,
              pi.unit_purchase_price AS unit_price,
              SUM(pi.quantity_received) AS quantity,
              SUM(pi.quantity_received * pi.unit_purchase_price) AS amount
       FROM purchase_items pi
       JOIN purchases p ON p.id = pi.purchase_id
       JOIN items i ON i.id = pi.item_id
       WHERE p.tenant_id = ?
         AND p.purchase_date >= ?
         AND p.purchase_date < ?
       GROUP BY day, p.supplier_name, p.invoice_number, pi.item_id, i.item_code, i.name_en, i.name_mr, i.liquor_type, i.volume_ml, pi.unit_purchase_price
       ORDER BY day ASC, p.supplier_name COLLATE NOCASE ASC, p.invoice_number COLLATE NOCASE ASC, i.name_en COLLATE NOCASE ASC`,
      [tenantId, bounds.from, bounds.until],
    );
    const purchaseDays = await database.getAllAsync<PurchaseDaySqlRow>(
      `SELECT ${localDay('purchase_date')} AS day,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(total_amount), 0) AS purchase_amount,
              COALESCE(SUM(total_amount - paid_amount), 0) AS purchase_credit
       FROM purchases
       WHERE tenant_id = ?
         AND purchase_date >= ?
         AND purchase_date < ?
       GROUP BY day
       ORDER BY day ASC`,
      [tenantId, bounds.from, bounds.until],
    );

    const items = await database.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE tenant_id = ?`,
      [tenantId],
    );
    const types = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM item_types WHERE tenant_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
      [tenantId],
    );

    return {
      salesLines: salesLines.map(mapMovement),
      salesDays: salesDays.map(mapSalesDay),
      purchaseLines: purchaseLines.map(mapPurchaseLine),
      purchaseDays: purchaseDays.map(mapPurchaseDay),
      stock: items.flatMap((row) => {
        const item = mapItem(row);
        return item ? [item] : [];
      }),
      typeOrder: types.map((row) => row.name),
    };
  });
}

function mapMovement(row: MovementSqlRow): MovementRow {
  return {
    day: row.day,
    itemId: row.item_id,
    itemCode: row.item_code,
    nameEn: row.name_en,
    nameMr: row.name_mr,
    liquorType: row.liquor_type,
    volumeMl: Number(row.volume_ml),
    quantity: Math.round(Number(row.quantity) || 0),
    amount: Number(row.amount) || 0,
    unitPaise: Math.round((Number(row.unit_price) || 0) * 100),
    staffName: row.staff_name?.trim() || '',
  };
}

function mapPurchaseLine(row: PurchaseSqlRow): PurchaseLineRow {
  return {
    ...mapMovement(row),
    supplierName: row.supplier_name.trim(),
    invoiceNumber: row.invoice_number.trim(),
  };
}

function mapSalesDay(row: SalesDaySqlRow): SalesDayRow {
  return {
    day: row.day,
    billCount: Number(row.bill_count) || 0,
    salesAmount: Number(row.sales_amount) || 0,
    cashAmount: Number(row.cash_amount) || 0,
    upiAmount: Number(row.upi_amount) || 0,
    otherAmount: Number(row.other_amount) || 0,
    creditAmount: Number(row.credit_amount) || 0,
  };
}

function mapPurchaseDay(row: PurchaseDaySqlRow): PurchaseDayRow {
  return {
    day: row.day,
    invoiceCount: Number(row.invoice_count) || 0,
    purchaseAmount: Number(row.purchase_amount) || 0,
    purchaseCredit: Number(row.purchase_credit) || 0,
  };
}

function mapItem(row: ItemRow): StockItem | null {
  if (!row.liquor_type.trim() || !row.sub_type.trim()) {
    return null;
  }
  const serialNo = Number(row.serial_no);
  const volumeMl = Number(row.volume_ml);
  const currentStock = Number(row.current_stock);
  const lowStockThreshold = Number(row.low_stock_threshold);
  const purchasePrice = Number(row.purchase_price);
  const sellingPrice = Number(row.selling_price);
  if (
    !Number.isInteger(serialNo) ||
    serialNo < 0 ||
    !Number.isInteger(volumeMl) ||
    volumeMl <= 0 ||
    !Number.isInteger(currentStock) ||
    currentStock < 0 ||
    !Number.isInteger(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice < 0 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0
  ) {
    return null;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    serialNo,
    itemCode: row.item_code,
    nameEn: row.name_en,
    nameMr: row.name_mr,
    brand: row.brand,
    liquorType: row.liquor_type,
    subType: row.sub_type,
    serviceStation: resolveServiceStation(row.service_station, row.liquor_type),
    volumeMl,
    purchasePrice: Math.round(purchasePrice * 100) / 100,
    sellingPrice: Math.round(sellingPrice * 100) / 100,
    currentStock,
    lowStockThreshold,
  };
}
