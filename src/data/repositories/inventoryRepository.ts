import type { SQLiteDatabase } from 'expo-sqlite';

import { InventoryAccessError, InventoryValidationError } from '../../domain/errors';
import {
  buildPurchaseRecord,
  isLiquorType,
  isSubType,
  type PurchaseFormInput,
  type StockItem,
} from '../../domain/models/inventory';
import { isUniqueConstraintError, withDatabase, withLockedTransaction } from '../local/database';
import { STARTER_CATALOG } from '../local/starterCatalog';

type ItemRow = {
  id: string;
  tenant_id: string;
  item_code: string;
  name_en: string;
  name_mr: string;
  brand: string;
  liquor_type: string;
  sub_type: string;
  volume_ml: number;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  low_stock_threshold: number;
};

const ITEM_COLUMNS = `id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
  volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold`;

export async function listStock(tenantId: string): Promise<StockItem[]> {
  await ensureStarterCatalog(tenantId);
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

    await insertActivity(database, {
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
    updated = item;
  });

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

    await insertActivity(database, {
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
    updated = item;
  });

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

      const purchaseId = crypto.randomUUID();
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
          [crypto.randomUUID(), purchaseId, line.itemId, line.quantityReceived, unitRupees],
        );

        const updated = await database.runAsync(
          `UPDATE items
           SET current_stock = current_stock + ?,
               purchase_price = ?
           WHERE id = ? AND tenant_id = ?`,
          [line.quantityReceived, unitRupees, line.itemId, tenantId],
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
    });
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

async function ensureStarterCatalog(tenantId: string): Promise<void> {
  await withLockedTransaction(async (database) => {
    const tenant = await database.getFirstAsync<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return;
    }

    const existing = await database.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM items WHERE tenant_id = ?',
      [tenantId],
    );
    if ((existing?.total ?? 0) > 0) {
      return;
    }

    for (const item of STARTER_CATALOG) {
      await database.runAsync(
        `INSERT INTO items (
           id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
           volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          `${tenantId}:${item.itemCode}`,
          tenantId,
          item.itemCode,
          item.nameEn,
          item.nameMr,
          item.brand,
          item.liquorType,
          item.subType,
          item.volumeMl,
          item.purchasePrice,
          item.sellingPrice,
          item.lowStockThreshold,
        ],
      );
    }
  });
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
): Promise<void> {
  await database.runAsync(
    `INSERT INTO activity_logs (
       id, tenant_id, actor_id, action, entity, entity_id, detail, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      entry.tenantId,
      entry.actorId,
      entry.action,
      entry.entity,
      entry.entityId,
      JSON.stringify(entry.detail),
      Date.now(),
    ],
  );
}

function mapItem(row: ItemRow): StockItem | null {
  if (!isLiquorType(row.liquor_type) || !isSubType(row.sub_type)) {
    return null;
  }

  const volumeMl = Number(row.volume_ml);
  const currentStock = Number(row.current_stock);
  const lowStockThreshold = Number(row.low_stock_threshold);
  const purchasePrice = Number(row.purchase_price);
  const sellingPrice = Number(row.selling_price);
  if (
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
    itemCode: row.item_code,
    nameEn: row.name_en,
    nameMr: row.name_mr,
    brand: row.brand,
    liquorType: row.liquor_type,
    subType: row.sub_type,
    volumeMl,
    purchasePrice: Math.round(purchasePrice * 100) / 100,
    sellingPrice: Math.round(sellingPrice * 100) / 100,
    currentStock,
    lowStockThreshold,
  };
}
