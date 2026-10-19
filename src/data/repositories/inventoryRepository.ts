import type { SQLiteDatabase } from 'expo-sqlite';

import { InventoryAccessError, InventoryValidationError } from '../../domain/errors';
import {
  buildPurchaseRecord,
  parseCatalogItem,
  parseCatalogTerm,
  parseVendor,
  resolveServiceStation,
  type CatalogItemInput,
  type CatalogTerm,
  type PurchaseFormInput,
  type StockItem,
  type Vendor,
  type VendorInput,
} from '../../domain/models/inventory';
import { newId } from '../../security/id';
import { isUniqueConstraintError, withDatabase, withLockedTransaction } from '../local/database';
import { requestSync, syncNow } from '../sync/engine';
import { enqueueDelete, enqueueUpsert, recordAdjustment } from '../sync/outbox';

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

const ITEM_COLUMNS = `id, tenant_id, serial_no, item_code, name_en, name_mr, brand, liquor_type, sub_type,
  service_station, volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold`;

export async function listStock(tenantId: string): Promise<StockItem[]> {
  return withDatabase(async (database) => {
    const rows = await database.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE tenant_id = ?`,
      [tenantId],
    );
    return rows.flatMap((row) => {
      const item = mapItem(row);
      return item ? [item] : [];
    });
  });
}

export async function adjustItemStock(input: {
  tenantId: string;
  actorId: string;
  itemId: string;
  delta: 1 | -1;
}): Promise<StockItem> {
  if (input.delta !== 1 && input.delta !== -1) {
    throw new InventoryValidationError('quantity');
  }

  let updated: StockItem | null = null;
  await withLockedTransaction(async (database) => {
    await assertAdmin(database, input.tenantId, input.actorId);
    const result = await database.runAsync(
      `UPDATE items
       SET current_stock = current_stock + ?
       WHERE id = ? AND tenant_id = ? AND current_stock + ? >= 0`,
      [input.delta, input.itemId, input.tenantId, input.delta],
    );

    if (result.changes !== 1) {
      const existing = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM items WHERE id = ? AND tenant_id = ?',
        [input.itemId, input.tenantId],
      );
      throw new InventoryValidationError(existing ? 'stock' : 'unknown-item');
    }

    const row = await database.getFirstAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = ? AND tenant_id = ?`,
      [input.itemId, input.tenantId],
    );
    const item = row ? mapItem(row) : null;
    if (!item) {
      throw new InventoryValidationError('unknown-item');
    }

    const activityId = await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'stock.adjust',
      entity: 'items',
      entityId: item.id,
      detail: {
        itemCode: item.itemCode,
        delta: input.delta,
        currentStock: item.currentStock,
      },
    });
    await recordAdjustment(database, {
      id: activityId,
      tenantId: input.tenantId,
      itemId: item.id,
      delta: input.delta,
      createdAt: Date.now(),
    });
    updated = item;
  });
  requestSync();

  if (!updated) {
    throw new InventoryValidationError('unknown');
  }
  return updated;
}

export async function correctItemStock(input: {
  tenantId: string;
  actorId: string;
  itemId: string;
  nextStock: number;
}): Promise<StockItem> {
  if (!Number.isInteger(input.nextStock) || input.nextStock < 0 || input.nextStock > 9999) {
    throw new InventoryValidationError('quantity');
  }

  let updated: StockItem | null = null;
  await withLockedTransaction(async (database) => {
    await assertAdmin(database, input.tenantId, input.actorId);
    const row = await database.getFirstAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = ? AND tenant_id = ?`,
      [input.itemId, input.tenantId],
    );
    const current = row ? mapItem(row) : null;
    if (!current) {
      throw new InventoryValidationError('unknown-item');
    }
    if (current.currentStock === input.nextStock) {
      updated = current;
      return;
    }

    const result = await database.runAsync(
      `UPDATE items
       SET current_stock = ?
       WHERE id = ? AND tenant_id = ?`,
      [input.nextStock, input.itemId, input.tenantId],
    );
    if (result.changes !== 1) {
      throw new InventoryValidationError('unknown-item');
    }

    const nextRow = await database.getFirstAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = ? AND tenant_id = ?`,
      [input.itemId, input.tenantId],
    );
    const item = nextRow ? mapItem(nextRow) : null;
    if (!item) {
      throw new InventoryValidationError('unknown-item');
    }

    const activityId = await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'stock.adjust',
      entity: 'items',
      entityId: item.id,
      detail: {
        itemCode: item.itemCode,
        previousStock: current.currentStock,
        delta: input.nextStock - current.currentStock,
        currentStock: item.currentStock,
      },
    });
    await recordAdjustment(database, {
      id: activityId,
      tenantId: input.tenantId,
      itemId: item.id,
      delta: input.nextStock - current.currentStock,
      createdAt: Date.now(),
    });
    updated = item;
  });
  requestSync();

  if (!updated) {
    throw new InventoryValidationError('unknown');
  }
  return updated;
}

export async function recordPurchase(
  tenantId: string,
  actorId: string,
  form: PurchaseFormInput,
): Promise<void> {
  const draft = buildPurchaseRecord(form);

  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, tenantId, actorId);

      const vendor = await database.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM vendors
         WHERE tenant_id = ? AND name = ? COLLATE NOCASE`,
        [tenantId, draft.supplierName],
      );
      if (!vendor) {
        throw new InventoryValidationError('supplier');
      }

      const duplicate = await database.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM purchases
         WHERE tenant_id = ?
           AND supplier_name = ? COLLATE NOCASE
           AND invoice_number = ? COLLATE NOCASE`,
        [tenantId, draft.supplierName, draft.invoiceNumber],
      );
      if (duplicate) {
        throw new InventoryValidationError('duplicate-invoice');
      }

      for (const line of draft.lines) {
        const item = await database.getFirstAsync<{ id: string }>(
          'SELECT id FROM items WHERE id = ? AND tenant_id = ?',
          [line.itemId, tenantId],
        );
        if (!item) {
          throw new InventoryValidationError('unknown-item');
        }
      }

      const purchaseId = newId();
      const purchasedAt = Date.now();
      await database.runAsync(
        `INSERT INTO purchases (
           id, tenant_id, invoice_number, supplier_name, purchase_date,
           total_amount, paid_amount, payment_type, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          tenantId,
          draft.invoiceNumber,
          draft.supplierName,
          purchasedAt,
          draft.totalPaise / 100,
          draft.paidPaise / 100,
          draft.paymentType,
          actorId,
        ],
      );

      for (const line of draft.lines) {
        const unitRupees = line.unitPurchasePaise / 100;
        await database.runAsync(
          `INSERT INTO purchase_items (
             id, purchase_id, item_id, quantity_received, unit_purchase_price
           ) VALUES (?, ?, ?, ?, ?)`,
          [newId(), purchaseId, line.itemId, line.quantityReceived, unitRupees],
        );

        const updated = await database.runAsync(
          `UPDATE items
           SET current_stock = current_stock + ?,
               purchase_price = ?,
               updated_at = ?
           WHERE id = ? AND tenant_id = ?`,
          [line.quantityReceived, unitRupees, purchasedAt, line.itemId, tenantId],
        );
        if (updated.changes !== 1) {
          throw new InventoryValidationError('unknown-item');
        }
      }

      await insertActivity(database, {
        tenantId,
        actorId,
        action: 'purchase.inward',
        entity: 'purchases',
        entityId: purchaseId,
        detail: {
          invoiceNumber: draft.invoiceNumber,
          supplierName: draft.supplierName,
          paymentType: draft.paymentType,
          totalAmount: draft.totalPaise / 100,
          paidAmount: draft.paidPaise / 100,
          lineCount: draft.lines.length,
        },
      });
      await enqueueUpsert(database, 'purchases', purchaseId);
      for (const line of draft.lines) {
        await enqueueUpsert(database, 'items', line.itemId);
      }
    });
    void syncNow();
  } catch (error) {
    if (error instanceof InventoryValidationError || error instanceof InventoryAccessError) {
      throw error;
    }
    if (isUniqueConstraintError(error)) {
      throw new InventoryValidationError('duplicate-invoice');
    }
    throw error;
  }
}

type VendorRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
};

export async function listVendors(tenantId: string): Promise<Vendor[]> {
  return withDatabase(async (database) => {
    const rows = await database.getAllAsync<VendorRow>(
      `SELECT id, tenant_id, name, phone
       FROM vendors
       WHERE tenant_id = ?
       ORDER BY name COLLATE NOCASE`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      phone: row.phone,
    }));
  });
}

export type CatalogTermKind = 'type' | 'strength';

export async function listCatalogTerms(tenantId: string, kind: CatalogTermKind): Promise<CatalogTerm[]> {
  return withLockedTransaction(async (database) => {
    const tenant = await database.getFirstAsync<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return [];
    }
    return readCatalogTerms(database, tenantId, kind);
  });
}

export async function saveCatalogTerm(input: {
  tenantId: string;
  actorId: string;
  kind: CatalogTermKind;
  termId: string | null;
  name: string;
}): Promise<void> {
  const name = parseCatalogTerm(input.name);
  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, input.tenantId, input.actorId);
      const table = termTable(input.kind);
      const column = termColumn(input.kind);
      if (input.termId) {
        const current = await database.getFirstAsync<{ name: string }>(
          `SELECT name FROM ${table} WHERE id = ? AND tenant_id = ?`,
          [input.termId, input.tenantId],
        );
        if (!current) {
          throw new InventoryValidationError('unknown');
        }
        const now = Date.now();
        if (current.name !== name) {
          await database.runAsync(`UPDATE ${table} SET name = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`, [
            name,
            now,
            input.termId,
            input.tenantId,
          ]);
          await database.runAsync(
            `UPDATE items SET ${column} = ?, updated_at = ? WHERE tenant_id = ? AND ${column} = ?`,
            [name, now, input.tenantId, current.name],
          );
          const affected = await database.getAllAsync<{ id: string }>(
            `SELECT id FROM items WHERE tenant_id = ? AND ${column} = ?`,
            [input.tenantId, name],
          );
          for (const item of affected) {
            await enqueueUpsert(database, 'items', item.id);
          }
        }
        await enqueueUpsert(database, table, input.termId);
        await insertActivity(database, {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: 'catalog-term.update',
          entity: table,
          entityId: input.termId,
          detail: { name },
        });
        return;
      }

      const last = await database.getFirstAsync<{ sort_order: number }>(
        `SELECT sort_order FROM ${table} WHERE tenant_id = ? ORDER BY sort_order DESC LIMIT 1`,
        [input.tenantId],
      );
      const termId = newId();
      await database.runAsync(
        `INSERT INTO ${table} (id, tenant_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [termId, input.tenantId, name, (last?.sort_order ?? -1) + 1, Date.now()],
      );
      await enqueueUpsert(database, table, termId);
      await insertActivity(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'catalog-term.create',
        entity: table,
        entityId: termId,
        detail: { name },
      });
    });
    requestSync();
  } catch (error) {
    throw mapTermWriteError(error);
  }
}

export async function deleteCatalogTerm(input: {
  tenantId: string;
  actorId: string;
  kind: CatalogTermKind;
  termId: string;
}): Promise<void> {
  await withLockedTransaction(async (database) => {
    await assertAdmin(database, input.tenantId, input.actorId);
    const table = termTable(input.kind);
    const column = termColumn(input.kind);
    const current = await database.getFirstAsync<{ name: string }>(
      `SELECT name FROM ${table} WHERE id = ? AND tenant_id = ?`,
      [input.termId, input.tenantId],
    );
    if (!current) {
      throw new InventoryValidationError('unknown');
    }
    const used = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM items WHERE tenant_id = ? AND ${column} = ? COLLATE NOCASE LIMIT 1`,
      [input.tenantId, current.name],
    );
    if (used) {
      throw new InventoryValidationError('label-in-use');
    }
    await database.runAsync(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`, [input.termId, input.tenantId]);
    await enqueueDelete(database, table, input.termId);
    await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'catalog-term.delete',
      entity: table,
      entityId: input.termId,
      detail: { name: current.name },
    });
  });
  requestSync();
}

export async function createCatalogItem(input: {
  tenantId: string;
  actorId: string;
  item: CatalogItemInput;
}): Promise<void> {
  const draft = parseCatalogItem(input.item);
  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, input.tenantId, input.actorId);
      const liquorType = await canonicalTerm(database, input.tenantId, 'type', draft.liquorType);
      const subType = await canonicalTerm(database, input.tenantId, 'strength', draft.subType);
      const itemId = newId();
      const now = Date.now();
      const maxSerial = await database.getFirstAsync<{ serial_no: number }>(
        'SELECT COALESCE(MAX(serial_no), 0) AS serial_no FROM items WHERE tenant_id = ?',
        [input.tenantId],
      );
      const serialNo = (maxSerial?.serial_no ?? 0) + 1;
      await database.runAsync(
        `INSERT INTO items (
           id, tenant_id, serial_no, item_code, name_en, name_mr, brand, liquor_type, sub_type,
           service_station, volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          itemId,
          input.tenantId,
          serialNo,
          draft.itemCode,
          draft.nameEn,
          draft.nameMr,
          draft.brand,
          liquorType,
          subType,
          draft.serviceStation,
          draft.volumeMl,
          draft.purchasePrice,
          draft.sellingPrice,
          draft.lowStockThreshold,
          now,
        ],
      );
      await enqueueUpsert(database, 'items', itemId);
      await insertActivity(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'catalog.create',
        entity: 'items',
        entityId: itemId,
        detail: { itemCode: draft.itemCode },
      });
    });
    requestSync();
  } catch (error) {
    throw mapCatalogWriteError(error);
  }
}

export async function updateCatalogItem(input: {
  tenantId: string;
  actorId: string;
  itemId: string;
  item: CatalogItemInput;
}): Promise<void> {
  const draft = parseCatalogItem(input.item);
  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, input.tenantId, input.actorId);
      const liquorType = await canonicalTerm(database, input.tenantId, 'type', draft.liquorType);
      const subType = await canonicalTerm(database, input.tenantId, 'strength', draft.subType);
      const updated = await database.runAsync(
        `UPDATE items
         SET item_code = ?, name_en = ?, name_mr = ?, brand = ?, liquor_type = ?, sub_type = ?,
             service_station = ?, volume_ml = ?, purchase_price = ?, selling_price = ?,
             low_stock_threshold = ?, updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          draft.itemCode,
          draft.nameEn,
          draft.nameMr,
          draft.brand,
          liquorType,
          subType,
          draft.serviceStation,
          draft.volumeMl,
          draft.purchasePrice,
          draft.sellingPrice,
          draft.lowStockThreshold,
          Date.now(),
          input.itemId,
          input.tenantId,
        ],
      );
      if (updated.changes !== 1) {
        throw new InventoryValidationError('unknown-item');
      }
      await insertActivity(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'catalog.update',
        entity: 'items',
        entityId: input.itemId,
        detail: { itemCode: draft.itemCode },
      });
      await enqueueUpsert(database, 'items', input.itemId);
    });
    requestSync();
  } catch (error) {
    throw mapCatalogWriteError(error);
  }
}

export async function deleteCatalogItem(input: {
  tenantId: string;
  actorId: string;
  itemId: string;
}): Promise<void> {
  await withLockedTransaction(async (database) => {
    await assertAdmin(database, input.tenantId, input.actorId);
    const item = await database.getFirstAsync<{ item_code: string; current_stock: number }>(
      'SELECT item_code, current_stock FROM items WHERE id = ? AND tenant_id = ?',
      [input.itemId, input.tenantId],
    );
    if (!item) {
      throw new InventoryValidationError('unknown-item');
    }
    if (Number(item.current_stock) > 0) {
      throw new InventoryValidationError('has-stock');
    }
    const used = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM purchase_items WHERE item_id = ?
       UNION ALL
       SELECT id FROM order_items WHERE item_id = ?
       LIMIT 1`,
      [input.itemId, input.itemId],
    );
    if (used) {
      throw new InventoryValidationError('in-use');
    }
    await database.runAsync('DELETE FROM items WHERE id = ? AND tenant_id = ?', [input.itemId, input.tenantId]);
    await enqueueDelete(database, 'items', input.itemId);
    await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'catalog.delete',
      entity: 'items',
      entityId: input.itemId,
      detail: { itemCode: item.item_code },
    });
  });
  requestSync();
}

export async function createVendor(input: {
  tenantId: string;
  actorId: string;
  vendor: VendorInput;
}): Promise<void> {
  const draft = parseVendor(input.vendor);
  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, input.tenantId, input.actorId);
      const vendorId = newId();
      await database.runAsync(
        'INSERT INTO vendors (id, tenant_id, name, phone, updated_at) VALUES (?, ?, ?, ?, ?)',
        [vendorId, input.tenantId, draft.name, draft.phone, Date.now()],
      );
      await enqueueUpsert(database, 'vendors', vendorId);
      await insertActivity(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'vendor.create',
        entity: 'vendors',
        entityId: vendorId,
        detail: { name: draft.name },
      });
    });
    requestSync();
  } catch (error) {
    throw mapVendorWriteError(error);
  }
}

export async function updateVendor(input: {
  tenantId: string;
  actorId: string;
  vendorId: string;
  vendor: VendorInput;
}): Promise<void> {
  const draft = parseVendor(input.vendor);
  try {
    await withLockedTransaction(async (database) => {
      await assertAdmin(database, input.tenantId, input.actorId);
      const updated = await database.runAsync(
        'UPDATE vendors SET name = ?, phone = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
        [draft.name, draft.phone, Date.now(), input.vendorId, input.tenantId],
      );
      if (updated.changes !== 1) {
        throw new InventoryValidationError('unknown');
      }
      await enqueueUpsert(database, 'vendors', input.vendorId);
      await insertActivity(database, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'vendor.update',
        entity: 'vendors',
        entityId: input.vendorId,
        detail: { name: draft.name },
      });
    });
    requestSync();
  } catch (error) {
    throw mapVendorWriteError(error);
  }
}

export async function deleteVendor(input: { tenantId: string; actorId: string; vendorId: string }): Promise<void> {
  await withLockedTransaction(async (database) => {
    await assertAdmin(database, input.tenantId, input.actorId);
    const vendor = await database.getFirstAsync<{ name: string }>(
      'SELECT name FROM vendors WHERE id = ? AND tenant_id = ?',
      [input.vendorId, input.tenantId],
    );
    if (!vendor) {
      throw new InventoryValidationError('unknown');
    }
    await database.runAsync('DELETE FROM vendors WHERE id = ? AND tenant_id = ?', [
      input.vendorId,
      input.tenantId,
    ]);
    await enqueueDelete(database, 'vendors', input.vendorId);
    await insertActivity(database, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'vendor.delete',
      entity: 'vendors',
      entityId: input.vendorId,
      detail: { name: vendor.name },
    });
  });
  requestSync();
}

function mapCatalogWriteError(error: unknown): Error {
  if (error instanceof InventoryValidationError || error instanceof InventoryAccessError) {
    return error;
  }
  if (isUniqueConstraintError(error)) {
    return new InventoryValidationError('duplicate-code');
  }
  return error instanceof Error ? error : new InventoryValidationError('unknown');
}

function mapTermWriteError(error: unknown): Error {
  if (error instanceof InventoryValidationError || error instanceof InventoryAccessError) {
    return error;
  }
  if (isUniqueConstraintError(error)) {
    return new InventoryValidationError('duplicate-label');
  }
  return error instanceof Error ? error : new InventoryValidationError('unknown');
}

function termTable(kind: CatalogTermKind): 'item_types' | 'item_strengths' {
  return kind === 'type' ? 'item_types' : 'item_strengths';
}

function termColumn(kind: CatalogTermKind): 'liquor_type' | 'sub_type' {
  return kind === 'type' ? 'liquor_type' : 'sub_type';
}

async function readCatalogTerms(
  database: SQLiteDatabase,
  tenantId: string,
  kind: CatalogTermKind,
): Promise<CatalogTerm[]> {
  const table = termTable(kind);
  const rows = await database.getAllAsync<{ id: string; tenant_id: string; name: string; sort_order: number }>(
    `SELECT id, tenant_id, name, sort_order FROM ${table} WHERE tenant_id = ? ORDER BY sort_order, name COLLATE NOCASE`,
    [tenantId],
  );
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sortOrder: Number(row.sort_order),
  }));
}

async function canonicalTerm(
  database: SQLiteDatabase,
  tenantId: string,
  kind: CatalogTermKind,
  name: string,
): Promise<string> {
  const table = termTable(kind);
  const row = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM ${table} WHERE tenant_id = ? AND name = ? COLLATE NOCASE`,
    [tenantId, name],
  );
  if (!row) {
    throw new InventoryValidationError('type');
  }
  return row.name;
}

function mapVendorWriteError(error: unknown): Error {
  if (error instanceof InventoryValidationError || error instanceof InventoryAccessError) {
    return error;
  }
  if (isUniqueConstraintError(error)) {
    return new InventoryValidationError('duplicate-vendor');
  }
  return error instanceof Error ? error : new InventoryValidationError('unknown');
}

async function assertAdmin(
  database: SQLiteDatabase,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const actor = await database.getFirstAsync<{ role: string; is_active: number }>(
    'SELECT role, is_active FROM users WHERE id = ? AND tenant_id = ?',
    [actorId, tenantId],
  );
  if (!actor || actor.role !== 'ADMIN' || actor.is_active !== 1) {
    throw new InventoryAccessError();
  }
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
): Promise<string> {
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
  return id;
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
