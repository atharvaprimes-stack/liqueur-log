import type { SQLiteDatabase } from 'expo-sqlite';

import { formatOrderSequence, localDateKey, nextSequenceValue, readSequenceTail } from '../../domain/billing';
import { isUniqueConstraintError } from '../local/database';
import { normalizeTableCount } from '../local/rows';
import { rememberAck } from './outbox';
import { asArray, booleanField, numberField, textField, type SyncSnapshot } from './snapshot';

/**
 * Copies a remote snapshot into the device database.
 * Purchases and paid orders are inserted once. Stock is not adjusted here;
 * the caller rebuilds it from purchases, order lines, and count corrections.
 */
export async function applySnapshot(
  database: SQLiteDatabase,
  tenantId: string,
  snapshot: SyncSnapshot,
): Promise<void> {
  await applyTenant(database, tenantId, snapshot.tenant ?? null);
  for (const user of snapshot.users ?? []) {
    await applyUser(database, tenantId, user);
  }
  for (const term of snapshot.item_types ?? []) {
    await applyTerm(database, tenantId, 'item_types', term);
  }
  for (const term of snapshot.item_strengths ?? []) {
    await applyTerm(database, tenantId, 'item_strengths', term);
  }
  for (const vendor of snapshot.vendors ?? []) {
    await applyVendor(database, tenantId, vendor);
  }
  for (const item of snapshot.items ?? []) {
    await applyItem(database, tenantId, item);
  }
  for (const sequence of snapshot.sequences ?? []) {
    await applySequence(database, tenantId, sequence);
  }
  for (const movement of snapshot.movements ?? []) {
    await applyMovement(database, tenantId, movement);
  }
  for (const purchase of snapshot.purchases ?? []) {
    await applyPurchase(database, tenantId, purchase);
  }
  for (const order of snapshot.orders ?? []) {
    await applyOrder(database, tenantId, order);
  }
  for (const entry of snapshot.activity ?? []) {
    await applyActivity(database, tenantId, entry);
  }
  for (const tombstone of snapshot.tombstones ?? []) {
    await applyTombstone(database, tenantId, tombstone);
  }
  await recomputeStock(database, tenantId);
}

export async function recomputeStock(database: SQLiteDatabase, tenantId: string): Promise<void> {
  await database.runAsync(
    `UPDATE items
     SET current_stock = MAX(0, CAST(
       COALESCE((
         SELECT SUM(purchase_items.quantity_received)
         FROM purchase_items
         JOIN purchases ON purchases.id = purchase_items.purchase_id
         WHERE purchase_items.item_id = items.id AND purchases.tenant_id = items.tenant_id
       ), 0)
       - COALESCE((
         SELECT SUM(order_items.quantity)
         FROM order_items
         JOIN orders ON orders.id = order_items.order_id
         WHERE order_items.item_id = items.id AND orders.tenant_id = items.tenant_id
       ), 0)
       + COALESCE((
         SELECT SUM(stock_movements.delta)
         FROM stock_movements
         WHERE stock_movements.item_id = items.id AND stock_movements.tenant_id = items.tenant_id
       ), 0)
     AS INTEGER))
     WHERE tenant_id = ?`,
    [tenantId],
  );
}

async function applyTenant(
  database: SQLiteDatabase,
  tenantId: string,
  tenant: Record<string, unknown> | null,
): Promise<void> {
  if (!tenant || textField(tenant, 'id') !== tenantId) {
    return;
  }
  const businessName = textField(tenant, 'business_name');
  const licenseNumber = textField(tenant, 'license_number');
  if (!businessName || !licenseNumber) {
    return;
  }
  const status = textField(tenant, 'subscription_status');
  await database.runAsync(
    `UPDATE tenants
     SET business_name = ?, license_number = ?, address = ?, subscription_status = ?,
         table_count = ?, inactivity_timeout_minutes = ?
     WHERE id = ?`,
    [
      businessName,
      licenseNumber,
      textField(tenant, 'address'),
      status === 'suspended' || status === 'on-hold' ? status : 'active',
      normalizeTableCount(numberField(tenant, 'table_count')),
      Math.max(1, Math.round(numberField(tenant, 'inactivity_timeout_minutes') || 60)),
      tenantId,
    ],
  );
}

async function applyUser(database: SQLiteDatabase, tenantId: string, user: Record<string, unknown>): Promise<void> {
  const id = textField(user, 'id');
  const role = textField(user, 'role');
  const mobile = textField(user, 'mobile_number');
  const name = textField(user, 'name');
  const hash = textField(user, 'mpin_hash');
  if (!id || textField(user, 'tenant_id') !== tenantId || (role !== 'ADMIN' && role !== 'STAFF') || !mobile || !name) {
    return;
  }
  if (await isPending(database, 'users', id)) {
    return;
  }
  const existing = await database.getFirstAsync<{ mpin_hash: string }>(
    'SELECT mpin_hash FROM users WHERE id = ? AND tenant_id = ?',
    [id, tenantId],
  );
  const nextHash = hash || existing?.mpin_hash || '';
  if (!nextHash) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO users (id, tenant_id, mobile_number, mpin_hash, name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         mobile_number = excluded.mobile_number,
         mpin_hash = excluded.mpin_hash,
         name = excluded.name,
         role = excluded.role,
         is_active = excluded.is_active
       WHERE users.tenant_id = excluded.tenant_id`,
      [id, tenantId, mobile, nextHash, name, role, booleanField(user, 'is_active') ? 1 : 0],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'users', id);
  }
}

async function applyTerm(
  database: SQLiteDatabase,
  tenantId: string,
  table: 'item_types' | 'item_strengths',
  term: Record<string, unknown>,
): Promise<void> {
  const id = textField(term, 'id');
  const name = textField(term, 'name');
  if (!id || !name || textField(term, 'tenant_id') !== tenantId || (await isPending(database, table, id))) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO ${table} (id, tenant_id, name, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       WHERE ${table}.tenant_id = excluded.tenant_id
         AND excluded.updated_at >= ${table}.updated_at`,
      [id, tenantId, name, Math.round(numberField(term, 'sort_order')), Math.round(numberField(term, 'updated_at'))],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, table, id);
  }
}

async function applyVendor(database: SQLiteDatabase, tenantId: string, vendor: Record<string, unknown>): Promise<void> {
  const id = textField(vendor, 'id');
  const name = textField(vendor, 'name');
  if (!id || !name || textField(vendor, 'tenant_id') !== tenantId || (await isPending(database, 'vendors', id))) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO vendors (id, tenant_id, name, phone, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         updated_at = excluded.updated_at
       WHERE vendors.tenant_id = excluded.tenant_id
         AND excluded.updated_at >= vendors.updated_at`,
      [id, tenantId, name, textField(vendor, 'phone'), Math.round(numberField(vendor, 'updated_at'))],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'vendors', id);
  }
}

async function applyItem(database: SQLiteDatabase, tenantId: string, item: Record<string, unknown>): Promise<void> {
  const id = textField(item, 'id');
  if (!id || textField(item, 'tenant_id') !== tenantId || (await isPending(database, 'items', id))) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO items (
         id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
         volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         item_code = excluded.item_code,
         name_en = excluded.name_en,
         name_mr = excluded.name_mr,
         brand = excluded.brand,
         liquor_type = excluded.liquor_type,
         sub_type = excluded.sub_type,
         volume_ml = excluded.volume_ml,
         purchase_price = excluded.purchase_price,
         selling_price = excluded.selling_price,
         low_stock_threshold = excluded.low_stock_threshold,
         updated_at = excluded.updated_at
       WHERE items.tenant_id = excluded.tenant_id
         AND excluded.updated_at >= items.updated_at`,
      [
        id,
        tenantId,
        textField(item, 'item_code'),
        textField(item, 'name_en'),
        textField(item, 'name_mr'),
        textField(item, 'brand'),
        textField(item, 'liquor_type'),
        textField(item, 'sub_type'),
        Math.round(numberField(item, 'volume_ml')),
        numberField(item, 'purchase_price'),
        numberField(item, 'selling_price'),
        Math.round(numberField(item, 'low_stock_threshold')),
        Math.round(numberField(item, 'updated_at')),
      ],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'items', id);
  }
}

async function applySequence(
  database: SQLiteDatabase,
  tenantId: string,
  sequence: Record<string, unknown>,
): Promise<void> {
  const dateKey = textField(sequence, 'sequence_date');
  const lastValue = Math.round(numberField(sequence, 'last_value'));
  if (!dateKey || lastValue < 0) {
    return;
  }
  await database.runAsync(
    `INSERT INTO order_sequences (tenant_id, sequence_date, last_value)
     VALUES (?, ?, ?)
     ON CONFLICT(tenant_id, sequence_date)
     DO UPDATE SET last_value = MAX(order_sequences.last_value, excluded.last_value)`,
    [tenantId, dateKey, lastValue],
  );
  await rememberAck(database, 'order_sequences', dateKey);
}

async function applyMovement(
  database: SQLiteDatabase,
  tenantId: string,
  movement: Record<string, unknown>,
): Promise<void> {
  const id = textField(movement, 'id');
  const itemId = textField(movement, 'item_id');
  const delta = Math.round(numberField(movement, 'delta'));
  if (!id || !itemId || delta === 0 || textField(movement, 'tenant_id') !== tenantId) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO stock_movements (id, tenant_id, item_id, delta, reason, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        id,
        tenantId,
        itemId,
        delta,
        textField(movement, 'reason') || 'adjust',
        textField(movement, 'source_id'),
        Math.round(numberField(movement, 'created_at')),
      ],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'stock_movements', id);
  }
}

async function applyPurchase(
  database: SQLiteDatabase,
  tenantId: string,
  purchase: Record<string, unknown>,
): Promise<void> {
  const id = textField(purchase, 'id');
  const invoice = textField(purchase, 'invoice_number');
  const supplier = textField(purchase, 'supplier_name');
  if (!id || !invoice || !supplier || textField(purchase, 'tenant_id') !== tenantId || (await isPending(database, 'purchases', id))) {
    return;
  }
  const existing = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM purchases
     WHERE tenant_id = ? AND (id = ? OR (supplier_name = ? COLLATE NOCASE AND invoice_number = ? COLLATE NOCASE))`,
    [tenantId, id, supplier, invoice],
  );
  if (existing) {
    await rememberAck(database, 'purchases', id);
    return;
  }
  const lines = asArray(purchase.lines);
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO purchases (
         id, tenant_id, invoice_number, supplier_name, purchase_date,
         total_amount, paid_amount, payment_type, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        invoice,
        supplier,
        Math.round(numberField(purchase, 'purchase_date')),
        numberField(purchase, 'total_amount'),
        numberField(purchase, 'paid_amount'),
        textField(purchase, 'payment_type'),
        textField(purchase, 'created_by'),
      ],
    );
    for (const line of lines) {
      await database.runAsync(
        `INSERT INTO purchase_items (id, purchase_id, item_id, quantity_received, unit_purchase_price)
         VALUES (?, ?, ?, ?, ?)`,
        [
          textField(line, 'id'),
          id,
          textField(line, 'item_id'),
          Math.round(numberField(line, 'quantity_received')),
          numberField(line, 'unit_purchase_price'),
        ],
      );
    }
  });
  if (saved === 'ok') {
    await rememberAck(database, 'purchases', id);
  }
}

async function applyOrder(database: SQLiteDatabase, tenantId: string, order: Record<string, unknown>): Promise<void> {
  const id = textField(order, 'id');
  const orderType = textField(order, 'order_type');
  const status = textField(order, 'status');
  const sequence = textField(order, 'order_sequence_string');
  if (
    !id ||
    !sequence ||
    (orderType !== 'TABLE' && orderType !== 'COUNTER') ||
    (status !== 'OPEN' && status !== 'PAID') ||
    textField(order, 'tenant_id') !== tenantId ||
    (await isPending(database, 'orders', id))
  ) {
    return;
  }

  const local = await database.getFirstAsync<{
    status: string;
    updated_at: number;
    created_at: number;
    closed_at: number | null;
  }>('SELECT status, updated_at, created_at, closed_at FROM orders WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  if (local?.status === 'PAID') {
    await rememberAck(database, 'orders', id);
    return;
  }
  const remoteVersion = orderVersion(order);
  if (local?.status === 'OPEN' && localVersion(local) > remoteVersion) {
    return;
  }

  const tableId = textField(order, 'table_id') || null;
  if (status === 'OPEN' && (await openSlotTaken(database, tenantId, id, orderType, tableId))) {
    return;
  }

  const lines = asArray(order.lines);
  const saved = await runSavepoint(database, async () => {
    if (local) {
      await database.runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);
    } else {
      await insertOrderShell(database, tenantId, order, sequence);
    }
    for (const line of lines) {
      await insertOrderLine(database, id, line);
    }
    if (status === 'PAID') {
      await markOrderPaid(database, tenantId, id, order);
      return;
    }
    await database.runAsync(
      `UPDATE orders
       SET total_amount = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`,
      [numberField(order, 'total_amount'), remoteVersion, id, tenantId],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'orders', id);
    return;
  }
  if (local || saved !== 'unique') {
    return;
  }
  const retried = await runSavepoint(database, async () => {
    const replacement = await nextLocalSequence(database, tenantId, Math.round(numberField(order, 'created_at')));
    await insertOrderShell(database, tenantId, order, replacement);
    for (const line of lines) {
      await insertOrderLine(database, id, line);
    }
    if (status === 'PAID') {
      await markOrderPaid(database, tenantId, id, order);
      return;
    }
    await database.runAsync(
      `UPDATE orders SET total_amount = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`,
      [numberField(order, 'total_amount'), remoteVersion, id, tenantId],
    );
  });
  if (retried === 'ok') {
    await rememberAck(database, 'orders', id);
  }
}

async function applyActivity(
  database: SQLiteDatabase,
  tenantId: string,
  entry: Record<string, unknown>,
): Promise<void> {
  const id = textField(entry, 'id');
  if (!id || textField(entry, 'tenant_id') !== tenantId) {
    return;
  }
  const saved = await runSavepoint(database, async () => {
    await database.runAsync(
      `INSERT INTO activity_logs (id, tenant_id, actor_id, action, entity, entity_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        id,
        tenantId,
        textField(entry, 'actor_id'),
        textField(entry, 'action'),
        textField(entry, 'entity'),
        textField(entry, 'entity_id'),
        textField(entry, 'detail') || '{}',
        Math.round(numberField(entry, 'created_at')),
      ],
    );
  });
  if (saved === 'ok') {
    await rememberAck(database, 'activity_logs', id);
  }
}

async function applyTombstone(
  database: SQLiteDatabase,
  tenantId: string,
  tombstone: Record<string, unknown>,
): Promise<void> {
  const entity = textField(tombstone, 'entity');
  const entityId = textField(tombstone, 'entity_id');
  if (!entityId || (await isPending(database, entity, entityId))) {
    return;
  }
  const acked = await database.getFirstAsync<{ entity_id: string }>(
    'SELECT entity_id FROM sync_acks WHERE entity = ? AND entity_id = ?',
    [entity, entityId],
  );
  if (!acked) {
    return;
  }
  await runSavepoint(database, async () => {
    if (entity === 'items') {
      await database.runAsync('DELETE FROM items WHERE id = ? AND tenant_id = ?', [entityId, tenantId]);
      return;
    }
    if (entity === 'vendors') {
      await database.runAsync('DELETE FROM vendors WHERE id = ? AND tenant_id = ?', [entityId, tenantId]);
      return;
    }
    if (entity === 'item_types' || entity === 'item_strengths') {
      await database.runAsync(`DELETE FROM ${entity} WHERE id = ? AND tenant_id = ?`, [entityId, tenantId]);
      return;
    }
    if (entity === 'orders') {
      await database.runAsync(`DELETE FROM orders WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`, [entityId, tenantId]);
    }
  });
}

async function insertOrderShell(
  database: SQLiteDatabase,
  tenantId: string,
  order: Record<string, unknown>,
  sequence: string,
): Promise<void> {
  const orderType = textField(order, 'order_type');
  const tableId = orderType === 'TABLE' ? textField(order, 'table_id') : null;
  await database.runAsync(
    `INSERT INTO orders (
       id, tenant_id, table_id, order_type, status, total_amount, paid_amount,
       payment_method, is_credit, order_sequence_string, created_at, closed_at, created_by, updated_at
     ) VALUES (?, ?, ?, ?, 'OPEN', 0, 0, NULL, 0, ?, ?, NULL, ?, ?)`,
    [
      textField(order, 'id'),
      tenantId,
      tableId,
      orderType,
      sequence,
      Math.round(numberField(order, 'created_at')),
      textField(order, 'created_by'),
      orderVersion(order),
    ],
  );
}

async function insertOrderLine(database: SQLiteDatabase, orderId: string, line: Record<string, unknown>): Promise<void> {
  await database.runAsync(
    `INSERT INTO order_items (
       id, order_id, item_id, item_code, name_en, name_mr, liquor_type, volume_ml, quantity, unit_price
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      textField(line, 'id'),
      orderId,
      textField(line, 'item_id'),
      textField(line, 'item_code'),
      textField(line, 'name_en'),
      textField(line, 'name_mr'),
      textField(line, 'liquor_type'),
      Math.round(numberField(line, 'volume_ml')),
      Math.round(numberField(line, 'quantity')),
      numberField(line, 'unit_price'),
    ],
  );
}

async function markOrderPaid(
  database: SQLiteDatabase,
  tenantId: string,
  orderId: string,
  order: Record<string, unknown>,
): Promise<void> {
  const total = numberField(order, 'total_amount');
  const paid = numberField(order, 'paid_amount');
  await database.runAsync(
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
      total,
      paid,
      textField(order, 'payment_method'),
      paid < total ? 1 : 0,
      Math.round(numberField(order, 'closed_at')) || Date.now(),
      orderVersion(order),
      orderId,
      tenantId,
    ],
  );
}

async function openSlotTaken(
  database: SQLiteDatabase,
  tenantId: string,
  orderId: string,
  orderType: string,
  tableId: string | null,
): Promise<boolean> {
  if (orderType === 'COUNTER') {
    const other = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM orders WHERE tenant_id = ? AND order_type = 'COUNTER' AND status = 'OPEN' AND id <> ?`,
      [tenantId, orderId],
    );
    return Boolean(other);
  }
  if (!tableId) {
    return true;
  }
  const other = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM orders
     WHERE tenant_id = ? AND table_id = ? AND order_type = 'TABLE' AND status = 'OPEN' AND id <> ?`,
    [tenantId, tableId, orderId],
  );
  return Boolean(other);
}

async function nextLocalSequence(database: SQLiteDatabase, tenantId: string, createdAt: number): Promise<string> {
  const dateKey = localDateKey(createdAt || Date.now());
  const tracker = await database.getFirstAsync<{ last_value: number }>(
    'SELECT last_value FROM order_sequences WHERE tenant_id = ? AND sequence_date = ?',
    [tenantId, dateKey],
  );
  const billed = await database.getAllAsync<{ order_sequence_string: string }>(
    'SELECT order_sequence_string FROM orders WHERE tenant_id = ? AND order_sequence_string LIKE ?',
    [tenantId, `${dateKey}-%`],
  );
  const billedTail = billed.reduce(
    (max, row) => Math.max(max, readSequenceTail(row.order_sequence_string, dateKey)),
    0,
  );
  const next = nextSequenceValue(Number(tracker?.last_value ?? 0), billedTail);
  await database.runAsync(
    `INSERT INTO order_sequences (tenant_id, sequence_date, last_value)
     VALUES (?, ?, ?)
     ON CONFLICT(tenant_id, sequence_date)
     DO UPDATE SET last_value = MAX(order_sequences.last_value, excluded.last_value)`,
    [tenantId, dateKey, next],
  );
  return formatOrderSequence(dateKey, next);
}

function orderVersion(order: Record<string, unknown>): number {
  const updatedAt = Math.round(numberField(order, 'updated_at'));
  if (updatedAt > 0) {
    return updatedAt;
  }
  const closedAt = Math.round(numberField(order, 'closed_at'));
  return closedAt > 0 ? closedAt : Math.round(numberField(order, 'created_at'));
}

function localVersion(order: { updated_at: number; created_at: number; closed_at: number | null }): number {
  if (Number(order.updated_at) > 0) {
    return Number(order.updated_at);
  }
  return Number(order.closed_at ?? order.created_at);
}

async function isPending(database: SQLiteDatabase, entity: string, entityId: string): Promise<boolean> {
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM sync_queue WHERE entity = ? AND entity_id = ? LIMIT 1',
    [entity, entityId],
  );
  return Boolean(row);
}

async function runSavepoint(database: SQLiteDatabase, task: () => Promise<void>): Promise<'ok' | 'unique' | 'failed'> {
  await database.execAsync('SAVEPOINT sync_row');
  try {
    await task();
    await database.execAsync('RELEASE SAVEPOINT sync_row');
    return 'ok';
  } catch (error) {
    await database.execAsync('ROLLBACK TO SAVEPOINT sync_row');
    await database.execAsync('RELEASE SAVEPOINT sync_row');
    return isUniqueConstraintError(error) ? 'unique' : 'failed';
  }
}
