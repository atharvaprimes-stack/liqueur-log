import type { SQLiteDatabase } from 'expo-sqlite';

import {
  formatOrderSequence,
  LIFETIME_SEQUENCE_KEY,
  lineTotalPaise,
  nextSequenceValue,
  readSequenceNumber,
  sequenceSearchNeedle,
} from '../../domain/billing';
import { OrderValidationError } from '../../domain/errors';
import { newId } from '../../security/id';
import { isUniqueConstraintError, withDatabase, withLockedTransaction } from '../local/database';
import { normalizeTableCount } from '../local/rows';
import { requestSync, syncNow } from '../sync/engine';
import { enqueueDelete, enqueueUpsert } from '../sync/outbox';
import { resolveServiceStation } from '../../domain/models/inventory';
import {
  isOrderStatus,
  isOrderType,
  isPaymentMethod,
  type OrderLine,
  type OrderSummary,
  type PaymentMethod,
  type SaleOrder,
} from '../../domain/models/orders';

const ORDER_COLUMNS = `id, tenant_id, table_id, order_type, status, total_amount, paid_amount,
  payment_method, is_credit, order_sequence_string, created_at, closed_at`;

const LINE_COLUMNS = `id, item_id, item_code, name_en, name_mr, liquor_type, service_station, volume_ml, quantity, unit_price`;

type OrderRow = {
  id: string;
  tenant_id: string;
  table_id: string | null;
  order_type: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  payment_method: string | null;
  is_credit: number;
  order_sequence_string: string;
  created_at: number;
  closed_at: number | null;
  item_count?: number | null;
};

type LineRow = {
  id: string;
  item_id: string;
  item_code: string;
  name_en: string;
  name_mr: string;
  liquor_type: string;
  service_station: string;
  volume_ml: number;
  quantity: number;
  unit_price: number;
};

type ItemRow = {
  id: string;
  item_code: string;
  name_en: string;
  name_mr: string;
  liquor_type: string;
  service_station: string;
  volume_ml: number;
  selling_price: number;
  current_stock: number;
};

export async function loadFloor(tenantId: string): Promise<{ tableCount: number; openOrders: OrderSummary[] }> {
  return withDatabase(async (database) => {
    const tenant = await database.getFirstAsync<{ table_count: number }>(
      'SELECT table_count FROM tenants WHERE id = ?',
      [tenantId],
    );
    const rows = await database.getAllAsync<OrderRow>(
      `SELECT ${ORDER_COLUMNS},
         COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id), 0) AS item_count
       FROM orders
       WHERE tenant_id = ? AND status = 'OPEN'
       ORDER BY created_at ASC`,
      [tenantId],
    );
    return {
      tableCount: normalizeTableCount(tenant?.table_count),
      openOrders: rows.map((row) => mapSummary(row)),
    };
  });
}

export async function searchClosedOrders(tenantId: string, query: string): Promise<OrderSummary[]> {
  const needle = sequenceSearchNeedle(query);
  return withDatabase(async (database) => {
    const rows = await database.getAllAsync<OrderRow>(
      `SELECT ${ORDER_COLUMNS}
       FROM orders
       WHERE tenant_id = ?
         AND status = 'PAID'
         AND (? = '' OR order_sequence_string LIKE '%' || ? || '%')
       ORDER BY closed_at DESC
       LIMIT 80`,
      [tenantId, needle, needle],
    );
    return rows.map((row) => mapSummary(row));
  });
}

/** Item IDs ranked by historical order quantity (most frequent first). */
export async function listFrequentItemIds(tenantId: string, limit = 40): Promise<string[]> {
  return withDatabase(async (database) => {
    const rows = await database.getAllAsync<{ item_id: string }>(
      `SELECT oi.item_id AS item_id
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.tenant_id = ?
       GROUP BY oi.item_id
       ORDER BY SUM(oi.quantity) DESC, MAX(o.created_at) DESC
       LIMIT ?`,
      [tenantId, limit],
    );
    return rows.map((row) => row.item_id);
  });
}

export async function getOrder(tenantId: string, orderId: string): Promise<SaleOrder> {
  return withDatabase(async (database) => readOrder(database, tenantId, orderId));
}

export async function getOpenTableOrder(tenantId: string, tableId: string): Promise<SaleOrder | null> {
  return withDatabase(async (database) => {
    const row = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM orders
       WHERE tenant_id = ? AND table_id = ? AND order_type = 'TABLE' AND status = 'OPEN'`,
      [tenantId, tableId],
    );
    return row ? readOrder(database, tenantId, row.id) : null;
  });
}

export async function startTableSession(input: {
  tenantId: string;
  actorId: string;
  tableNumber: string;
}): Promise<SaleOrder> {
  try {
    return await withLockedTransaction(async (database) => {
      await assertActor(database, input.tenantId, input.actorId);
      const tableCount = await readTableCount(database, input.tenantId);
      const tableNumber = normalizeTableNumber(input.tableNumber, tableCount);
      const existing = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM orders
         WHERE tenant_id = ? AND table_id = ? AND order_type = 'TABLE' AND status = 'OPEN'`,
        [input.tenantId, tableNumber],
      );
      if (existing) {
        return readOrder(database, input.tenantId, existing.id);
      }

      const orderId = await insertOrder(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        tableId: tableNumber,
        orderType: 'TABLE',
      });
      return readOrder(database, input.tenantId, orderId);
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const existing = await getOpenTableOrder(input.tenantId, input.tableNumber);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

export async function getOrCreateCounterOrder(input: { tenantId: string; actorId: string }): Promise<SaleOrder> {
  try {
    return await withLockedTransaction(async (database) => {
      await assertActor(database, input.tenantId, input.actorId);
      const existing = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM orders
         WHERE tenant_id = ? AND order_type = 'COUNTER' AND status = 'OPEN'`,
        [input.tenantId],
      );
      if (existing) {
        return readOrder(database, input.tenantId, existing.id);
      }
      const orderId = await insertOrder(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        tableId: null,
        orderType: 'COUNTER',
      });
      return readOrder(database, input.tenantId, orderId);
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    return withDatabase(async (database) => {
      const existing = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM orders
         WHERE tenant_id = ? AND order_type = 'COUNTER' AND status = 'OPEN'`,
        [input.tenantId],
      );
      if (!existing) {
        throw error;
      }
      return readOrder(database, input.tenantId, existing.id);
    });
  }
}

export async function addOrderItem(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
  itemCode?: string;
  itemId?: string;
  quantity: number;
}): Promise<SaleOrder> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 9999) {
    throw new OrderValidationError('quantity');
  }

  return withLockedTransaction(async (database) => {
    await assertActor(database, input.tenantId, input.actorId);
    const order = await requireOpenOrder(database, input.tenantId, input.orderId);
    const item = await findItem(database, input.tenantId, input);
    if (item.current_stock < input.quantity) {
      throw new OrderValidationError('stock');
    }

    // Each unit is its own row so staff can void one serve without editing shared qty.
    await applyStockDelta(database, input.tenantId, item.id, -input.quantity);
    const unitPrice = Math.round(item.selling_price * 100) / 100;
    const serviceStation = resolveServiceStation(item.service_station, item.liquor_type);
    for (let index = 0; index < input.quantity; index += 1) {
      await database.runAsync(
        `INSERT INTO order_items (
           id, order_id, item_id, item_code, name_en, name_mr, liquor_type, service_station,
           volume_ml, quantity, unit_price
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          order.id,
          item.id,
          item.item_code,
          item.name_en,
          item.name_mr,
          item.liquor_type,
          serviceStation,
          item.volume_ml,
          1,
          unitPrice,
        ],
      );
    }

    await syncTotal(database, order.id);
    await touchOrder(database, order.id);
    return readOrder(database, input.tenantId, order.id);
  });
}

export async function setOrderItemQuantity(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
  lineId: string;
  quantity: number;
}): Promise<SaleOrder> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 9999) {
    throw new OrderValidationError('quantity');
  }

  return withLockedTransaction(async (database) => {
    await assertActor(database, input.tenantId, input.actorId);
    const order = await requireOpenOrder(database, input.tenantId, input.orderId);
    await setLineQuantity(database, input.tenantId, order.id, input.lineId, input.quantity);
    await syncTotal(database, order.id);
    await touchOrder(database, order.id);
    return readOrder(database, input.tenantId, order.id);
  });
}

export async function releaseEmptyOrder(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
}): Promise<void> {
  await withLockedTransaction(async (database) => {
    await assertActor(database, input.tenantId, input.actorId);
    const order = await requireOpenOrder(database, input.tenantId, input.orderId);
    const line = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM order_items WHERE order_id = ? LIMIT 1',
      [order.id],
    );
    if (line) {
      throw new OrderValidationError('unknown');
    }
    const deleted = await database.runAsync(
      `DELETE FROM orders WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`,
      [order.id, input.tenantId],
    );
    if (deleted.changes !== 1) {
      throw new OrderValidationError('unknown');
    }
    await enqueueDelete(database, 'orders', order.id);
    await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'order.release',
      entity: 'orders',
      entityId: order.id,
      detail: {
        sequence: order.order_sequence_string,
        ...(order.table_id ? { tableId: order.table_id } : {}),
      },
    });
  });
  requestSync();
}

export async function settleOrder(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
  method: PaymentMethod;
  paidAmount: number;
}): Promise<SaleOrder> {
  if (!isPaymentMethod(input.method)) {
    throw new OrderValidationError('payment');
  }

  const saved = await withLockedTransaction(async (database) => {
    await assertActor(database, input.tenantId, input.actorId);
    const order = await requireOpenOrder(database, input.tenantId, input.orderId);
    const lines = await database.getAllAsync<{ quantity: number }>(
      'SELECT quantity FROM order_items WHERE order_id = ?',
      [order.id],
    );
    if (lines.length === 0) {
      throw new OrderValidationError('empty');
    }

    const total = await syncTotal(database, order.id);
    const totalPaise = Math.round(total * 100);
    const paidPaise = Math.round(input.paidAmount * 100);
    if (!Number.isInteger(paidPaise) || paidPaise < 0 || paidPaise > totalPaise) {
      throw new OrderValidationError('amount');
    }

    const closedAt = Date.now();
    const updated = await database.runAsync(
      `UPDATE orders
       SET status = 'PAID',
           total_amount = ?,
           paid_amount = ?,
           payment_method = ?,
           is_credit = ?,
           closed_at = ?,
           updated_at = ?
       WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`,
      [
        totalPaise / 100,
        paidPaise / 100,
        input.method,
        paidPaise < totalPaise ? 1 : 0,
        closedAt,
        closedAt,
        order.id,
        input.tenantId,
      ],
    );
    if (updated.changes !== 1) {
      throw new OrderValidationError('closed');
    }

    const saved = await readOrder(database, input.tenantId, order.id);
    await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'order.settle',
      entity: 'orders',
      entityId: order.id,
      detail: {
        sequence: saved.sequence,
        totalAmount: saved.totalAmount,
        paidAmount: saved.paidAmount,
        paymentMethod: input.method,
        credit: saved.isCredit ? 1 : 0,
        ...(saved.tableId ? { tableId: saved.tableId } : {}),
      },
    });
    await enqueueUpsert(database, 'orders', order.id);
    return saved;
  });
  void syncNow();
  return saved;
}

async function insertOrder(
  database: SQLiteDatabase,
  input: { tenantId: string; actorId: string; tableId: string | null; orderType: 'TABLE' | 'COUNTER' },
): Promise<string> {
  const orderId = newId();
  const createdAt = Date.now();
  const sequence = await allocateOrderSequence(database, input.tenantId, createdAt);
    await database.runAsync(
    `INSERT INTO orders (
       id, tenant_id, table_id, order_type, status, total_amount, paid_amount,
       payment_method, is_credit, order_sequence_string, created_at, closed_at, created_by, updated_at
     ) VALUES (?, ?, ?, ?, 'OPEN', 0, 0, NULL, 0, ?, ?, NULL, ?, ?)`,
    [orderId, input.tenantId, input.tableId, input.orderType, sequence, createdAt, input.actorId, createdAt],
  );
  await enqueueUpsert(database, 'orders', orderId);
  requestSync();
  await insertActivity(database, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'order.open',
    entity: 'orders',
    entityId: orderId,
    detail: {
      sequence,
      orderType: input.orderType,
      ...(input.tableId ? { tableId: input.tableId } : {}),
    },
  });
  return orderId;
}

/**
 * Lifetime bill numbers only move forward. Past order strings (including
 * legacy dated `YYYY-MM-DD-NN` values) are scanned so a missing tracker
 * cannot reuse a number that was already issued.
 */
async function allocateOrderSequence(database: SQLiteDatabase, tenantId: string, _now: number): Promise<string> {
  const tracker = await database.getFirstAsync<{ last_value: number }>(
    'SELECT last_value FROM order_sequences WHERE tenant_id = ? AND sequence_date = ?',
    [tenantId, LIFETIME_SEQUENCE_KEY],
  );
  const daily = await database.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(last_value), 0) AS total
     FROM order_sequences
     WHERE tenant_id = ? AND sequence_date <> ?`,
    [tenantId, LIFETIME_SEQUENCE_KEY],
  );
  const billed = await database.getAllAsync<{ order_sequence_string: string }>(
    'SELECT order_sequence_string FROM orders WHERE tenant_id = ?',
    [tenantId],
  );
  const orderCount = await database.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM orders WHERE tenant_id = ?',
    [tenantId],
  );
  const billedMax = billed.reduce((max, row) => Math.max(max, readSequenceNumber(row.order_sequence_string)), 0);
  const next = nextSequenceValue(
    Math.max(Number(tracker?.last_value ?? 0), Number(daily?.total ?? 0)),
    Math.max(billedMax, Number(orderCount?.total ?? 0)),
  );
  await database.runAsync(
    `INSERT INTO order_sequences (tenant_id, sequence_date, last_value)
     VALUES (?, ?, ?)
     ON CONFLICT (tenant_id, sequence_date)
     DO UPDATE SET last_value = excluded.last_value`,
    [tenantId, LIFETIME_SEQUENCE_KEY, next],
  );
  await enqueueUpsert(database, 'order_sequences', LIFETIME_SEQUENCE_KEY);
  return formatOrderSequence(next);
}

async function setLineQuantity(
  database: SQLiteDatabase,
  tenantId: string,
  orderId: string,
  lineId: string,
  quantity: number,
): Promise<void> {
  const line = await database.getFirstAsync<{ id: string; item_id: string; quantity: number }>(
    'SELECT id, item_id, quantity FROM order_items WHERE id = ? AND order_id = ?',
    [lineId, orderId],
  );
  if (!line) {
    throw new OrderValidationError('unknown-item');
  }
  if (line.quantity === quantity) {
    return;
  }
  if (quantity > 9999) {
    throw new OrderValidationError('quantity');
  }

  await applyStockDelta(database, tenantId, line.item_id, line.quantity - quantity);
  if (quantity === 0) {
    await database.runAsync('DELETE FROM order_items WHERE id = ? AND order_id = ?', [lineId, orderId]);
    return;
  }
  await database.runAsync('UPDATE order_items SET quantity = ? WHERE id = ? AND order_id = ?', [
    quantity,
    lineId,
    orderId,
  ]);
}

async function syncTotal(database: SQLiteDatabase, orderId: string): Promise<number> {
  const lines = await database.getAllAsync<{ quantity: number; unit_price: number }>(
    'SELECT quantity, unit_price FROM order_items WHERE order_id = ?',
    [orderId],
  );
  const totalPaise = lines.reduce((sum, line) => sum + lineTotalPaise(Number(line.quantity), Number(line.unit_price)), 0);
  const updated = await database.runAsync(
    `UPDATE orders SET total_amount = ? WHERE id = ? AND status = 'OPEN'`,
    [totalPaise / 100, orderId],
  );
  if (updated.changes !== 1) {
    throw new OrderValidationError('closed');
  }
  return totalPaise / 100;
}

async function applyStockDelta(
  database: SQLiteDatabase,
  tenantId: string,
  itemId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) {
    return;
  }
  const updated = await database.runAsync(
    `UPDATE items
     SET current_stock = current_stock + ?
     WHERE id = ? AND tenant_id = ? AND current_stock + ? >= 0`,
    [delta, itemId, tenantId, delta],
  );
  if (updated.changes === 1) {
    return;
  }
  const item = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM items WHERE id = ? AND tenant_id = ?',
    [itemId, tenantId],
  );
  throw new OrderValidationError(item ? 'stock' : 'unknown-item');
}

async function findItem(
  database: SQLiteDatabase,
  tenantId: string,
  input: { itemCode?: string; itemId?: string },
): Promise<ItemRow> {
  const code = input.itemCode?.trim() ?? '';
  const row = input.itemId
    ? await database.getFirstAsync<ItemRow>(
        `SELECT id, item_code, name_en, name_mr, liquor_type, service_station, volume_ml, selling_price, current_stock
         FROM items WHERE id = ? AND tenant_id = ?`,
        [input.itemId, tenantId],
      )
    : await database.getFirstAsync<ItemRow>(
        `SELECT id, item_code, name_en, name_mr, liquor_type, service_station, volume_ml, selling_price, current_stock
         FROM items WHERE tenant_id = ? AND item_code = ? COLLATE NOCASE
         ORDER BY item_code LIMIT 1`,
        [tenantId, code],
      );
  if (!row) {
    throw new OrderValidationError(input.itemId ? 'unknown-item' : 'code');
  }
  return row;
}

async function requireOpenOrder(database: SQLiteDatabase, tenantId: string, orderId: string): Promise<OrderRow> {
  const row = await database.getFirstAsync<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ? AND tenant_id = ?`,
    [orderId, tenantId],
  );
  if (!row) {
    throw new OrderValidationError('unknown');
  }
  if (row.status !== 'OPEN') {
    throw new OrderValidationError('closed');
  }
  return row;
}

async function readOrder(database: SQLiteDatabase, tenantId: string, orderId: string): Promise<SaleOrder> {
  const row = await database.getFirstAsync<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ? AND tenant_id = ?`,
    [orderId, tenantId],
  );
  if (!row) {
    throw new OrderValidationError('unknown');
  }
  const lines = await database.getAllAsync<LineRow>(
    `SELECT ${LINE_COLUMNS} FROM order_items WHERE order_id = ? ORDER BY rowid ASC`,
    [orderId],
  );
  const mappedLines = lines.map(mapLine);
  const itemCount = mappedLines.reduce((sum, line) => sum + line.quantity, 0);
  return { ...mapSummary(row), itemCount, lines: mappedLines };
}

async function readTableCount(database: SQLiteDatabase, tenantId: string): Promise<number> {
  const tenant = await database.getFirstAsync<{ table_count: number }>(
    'SELECT table_count FROM tenants WHERE id = ?',
    [tenantId],
  );
  if (!tenant) {
    throw new OrderValidationError('unknown');
  }
  return normalizeTableCount(tenant.table_count);
}

function normalizeTableNumber(tableNumber: string, tableCount: number): string {
  if (!/^\d{1,3}$/.test(tableNumber)) {
    throw new OrderValidationError('table');
  }
  const number = Number(tableNumber);
  if (!Number.isInteger(number) || number < 1 || number > tableCount) {
    throw new OrderValidationError('table');
  }
  return String(number);
}

async function assertActor(database: SQLiteDatabase, tenantId: string, actorId: string): Promise<void> {
  const actor = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1',
    [actorId, tenantId],
  );
  if (!actor) {
    throw new OrderValidationError('unknown');
  }
}

function mapSummary(row: OrderRow): OrderSummary {
  if (!isOrderType(row.order_type) || !isOrderStatus(row.status)) {
    throw new OrderValidationError('unknown');
  }
  if (row.payment_method !== null && !isPaymentMethod(row.payment_method)) {
    throw new OrderValidationError('unknown');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tableId: row.table_id,
    orderType: row.order_type,
    status: row.status,
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method,
    isCredit: row.is_credit === 1,
    sequence: row.order_sequence_string,
    createdAt: Number(row.created_at),
    closedAt: row.closed_at === null ? null : Number(row.closed_at),
    itemCount: Math.max(0, Math.round(Number(row.item_count) || 0)),
  };
}

function mapLine(row: LineRow): OrderLine {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    nameEn: row.name_en,
    nameMr: row.name_mr,
    liquorType: row.liquor_type,
    serviceStation: resolveServiceStation(row.service_station, row.liquor_type),
    volumeMl: Number(row.volume_ml),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
  };
}

async function touchOrder(database: SQLiteDatabase, orderId: string): Promise<void> {
  await database.runAsync(`UPDATE orders SET updated_at = ? WHERE id = ? AND status = 'OPEN'`, [Date.now(), orderId]);
  await enqueueUpsert(database, 'orders', orderId);
  requestSync();
}

async function insertActivity(
  database: SQLiteDatabase,
  entry: {
    tenantId: string;
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    detail: Record<string, string | number>;
  },
): Promise<void> {
  const id = newId();
  await database.runAsync(
    `INSERT INTO activity_logs (
       id, tenant_id, actor_id, action, entity, entity_id, detail, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.tenantId,
      entry.actorId,
      entry.action,
      entry.entity,
      entry.entityId,
      JSON.stringify(entry.detail),
      Date.now(),
    ],
  );
  await enqueueUpsert(database, 'activity_logs', id);
}
