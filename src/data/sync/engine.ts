import type { SQLiteDatabase } from 'expo-sqlite';

import { getSessionCredentials } from '../../security/sessionCredentials';
import { withDatabase, withLockedTransaction } from '../local/database';
import { isDeviceOnline } from '../network';
import { pullSyncSnapshot, pushSyncBatch } from '../remote/ledgerRemote';
import { pushPendingUsers } from '../remote/syncStaff';
import { isSupabaseConfigured } from '../remote/supabaseClient';
import { applySnapshot } from './merge';
import type { SyncChange } from './snapshot';

const CHUNK_SIZE = 80
const RETRY_DELAY_MS = 4000;

const UPSERT_PHASES = [
  ['item_types', 'item_strengths', 'vendors', 'items'],
  ['stock_movements', 'purchases', 'order_sequences'],
  ['orders', 'activity_logs'],
] as const;

const DELETE_ENTITIES = ['items', 'item_types', 'item_strengths', 'vendors', 'orders'] as const;

let flushing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function requestSync(): void {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, RETRY_DELAY_MS);
}

/** Pushes local changes, then pulls the tenant snapshot. Safe to call repeatedly. */
export function syncNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!flushing) {
    flushing = runSync().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runSync(): Promise<void> {
  const credentials = getSessionCredentials();
  if (!credentials || !isSupabaseConfigured() || !(await isDeviceOnline())) {
    return;
  }

  const tenantId = await withDatabase(async (database) => {
    const session = await database.getFirstAsync<{ tenant_id: string }>(
      `SELECT tenant_id FROM sessions WHERE id = 'current'`,
    );
    return session?.tenant_id ?? null;
  });
  if (!tenantId) {
    return;
  }

  await withDatabase(async (database) => {
    await backfillAdjustments(database, tenantId);
    await queueUnacked(database, tenantId);
  });

  const usersReady = await pushPendingUsers();
  if (!usersReady) {
    await pullTenant(credentials.mobileNumber, credentials.mpin, tenantId);
    return;
  }

  for (const entities of UPSERT_PHASES) {
    await pushPhase(credentials.mobileNumber, credentials.mpin, tenantId, entities, 'upsert');
  }
  await pushPhase(credentials.mobileNumber, credentials.mpin, tenantId, DELETE_ENTITIES, 'delete');
  await pullTenant(credentials.mobileNumber, credentials.mpin, tenantId);
}

async function pullTenant(mobileNumber: string, mpin: string, tenantId: string): Promise<void> {
  const snapshot = await pullSyncSnapshot(mobileNumber, mpin);
  if (!snapshot) {
    return;
  }
  await withLockedTransaction(async (database) => {
    await applySnapshot(database, tenantId, snapshot);
  });
}

async function pushPhase(
  mobileNumber: string,
  mpin: string,
  tenantId: string,
  entities: readonly string[],
  operation: 'upsert' | 'delete',
): Promise<boolean> {
  for (let pass = 0; pass < 100; pass += 1) {
    const changes = await withDatabase((database) => loadChanges(database, tenantId, entities, operation));
    if (changes.length === 0) {
      return true;
    }
    const acked = await pushSyncBatch(mobileNumber, mpin, changes);
    if (!acked) {
      return false;
    }
    if (acked.length === 0) {
      return false;
    }
    const accepted = new Set(acked);
    await withLockedTransaction(async (database) => {
      for (const change of changes) {
        if (!accepted.has(change.queue_id)) {
          continue;
        }
        await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [change.queue_id]);
        await database.runAsync(
          'INSERT INTO sync_acks (entity, entity_id) VALUES (?, ?) ON CONFLICT(entity, entity_id) DO NOTHING',
          [change.entity, change.entity_id],
        );
      }
    });
  }
  return false;
}

async function loadChanges(
  database: SQLiteDatabase,
  tenantId: string,
  entities: readonly string[],
  operation: 'upsert' | 'delete',
): Promise<SyncChange[]> {
  const placeholders = entities.map(() => '?').join(', ');
  const rows = await database.getAllAsync<{ id: string; entity: string; entity_id: string }>(
    `SELECT id, entity, entity_id
     FROM sync_queue
     WHERE operation = ? AND entity IN (${placeholders})
     ORDER BY created_at ASC
     LIMIT ?`,
    [operation, ...entities, CHUNK_SIZE],
  );

  const changes: SyncChange[] = [];
  for (const row of rows) {
    if (operation === 'delete') {
      changes.push({
        queue_id: row.id,
        entity: row.entity,
        entity_id: row.entity_id,
        operation: 'delete',
        record: { id: row.entity_id },
      });
      continue;
    }
    const record = await readRecord(database, tenantId, row.entity, row.entity_id);
    if (!record) {
      await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
      continue;
    }
    changes.push({
      queue_id: row.id,
      entity: row.entity,
      entity_id: row.entity_id,
      operation: 'upsert',
      record,
    });
  }
  return changes;
}

async function readRecord(
  database: SQLiteDatabase,
  tenantId: string,
  entity: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  if (entity === 'order_sequences') {
    const row = await database.getFirstAsync<Record<string, unknown>>(
      'SELECT tenant_id, sequence_date, last_value FROM order_sequences WHERE tenant_id = ? AND sequence_date = ?',
      [tenantId, entityId],
    );
    return row;
  }
  if (entity === 'purchases') {
    const purchase = await database.getFirstAsync<Record<string, unknown>>(
      `SELECT id, tenant_id, invoice_number, supplier_name, purchase_date, total_amount, paid_amount, payment_type, created_by
       FROM purchases WHERE id = ? AND tenant_id = ?`,
      [entityId, tenantId],
    );
    if (!purchase) {
      return null;
    }
    purchase.lines = await database.getAllAsync(
      `SELECT id, purchase_id, item_id, quantity_received, unit_purchase_price
       FROM purchase_items WHERE purchase_id = ?`,
      [entityId],
    );
    return purchase;
  }
  if (entity === 'orders') {
    const order = await database.getFirstAsync<Record<string, unknown>>(
      `SELECT id, tenant_id, table_id, order_type, status, total_amount, paid_amount, payment_method,
              is_credit, order_sequence_string, created_at, closed_at, created_by, updated_at
       FROM orders WHERE id = ? AND tenant_id = ?`,
      [entityId, tenantId],
    );
    if (!order) {
      return null;
    }
    order.lines = await database.getAllAsync(
      `SELECT id, order_id, item_id, item_code, name_en, name_mr, liquor_type, volume_ml, quantity, unit_price
       FROM order_items WHERE order_id = ?`,
      [entityId],
    );
    return order;
  }

  const tables: Record<string, string> = {
    items: `SELECT id, tenant_id, serial_no, item_code, name_en, name_mr, brand, liquor_type, sub_type,
              volume_ml, purchase_price, selling_price, low_stock_threshold, updated_at
       FROM items WHERE id = ? AND tenant_id = ?`,
    item_types: 'SELECT id, tenant_id, name, sort_order, updated_at FROM item_types WHERE id = ? AND tenant_id = ?',
    item_strengths:
      'SELECT id, tenant_id, name, sort_order, updated_at FROM item_strengths WHERE id = ? AND tenant_id = ?',
    vendors: 'SELECT id, tenant_id, name, phone, updated_at FROM vendors WHERE id = ? AND tenant_id = ?',
    stock_movements:
      'SELECT id, tenant_id, item_id, delta, reason, source_id, created_at FROM stock_movements WHERE id = ? AND tenant_id = ?',
    activity_logs:
      'SELECT id, tenant_id, actor_id, action, entity, entity_id, detail, created_at FROM activity_logs WHERE id = ? AND tenant_id = ?',
  };
  const sql = tables[entity];
  if (!sql) {
    return null;
  }
  return database.getFirstAsync<Record<string, unknown>>(sql, [entityId, tenantId]);
}

async function backfillAdjustments(database: SQLiteDatabase, tenantId: string): Promise<void> {
  await database.runAsync(
    `INSERT INTO stock_movements (id, tenant_id, item_id, delta, reason, source_id, created_at)
     SELECT
       activity_logs.id,
       activity_logs.tenant_id,
       activity_logs.entity_id,
       CAST(json_extract(activity_logs.detail, '$.delta') AS INTEGER),
       'adjust',
       activity_logs.id,
       activity_logs.created_at
     FROM activity_logs
     WHERE activity_logs.tenant_id = ?
       AND activity_logs.action = 'stock.adjust'
       AND CAST(json_extract(activity_logs.detail, '$.delta') AS INTEGER) <> 0
       AND EXISTS (SELECT 1 FROM items WHERE items.id = activity_logs.entity_id AND items.tenant_id = activity_logs.tenant_id)
     ON CONFLICT(id) DO NOTHING`,
    [tenantId],
  );
}

async function queueUnacked(database: SQLiteDatabase, tenantId: string): Promise<void> {
  const now = Date.now();
  const tables = [
    'items',
    'item_types',
    'item_strengths',
    'vendors',
    'purchases',
    'orders',
    'activity_logs',
    'stock_movements',
  ];
  for (const table of tables) {
    await database.runAsync(
      `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at)
       SELECT lower(hex(randomblob(16))), ?, ${table}.id, 'upsert', '{}', ?
       FROM ${table}
       WHERE ${table}.tenant_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM sync_acks WHERE sync_acks.entity = ? AND sync_acks.entity_id = ${table}.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM sync_queue WHERE sync_queue.entity = ? AND sync_queue.entity_id = ${table}.id
         )`,
      [table, now, tenantId, table, table],
    );
  }
  await database.runAsync(
    `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at)
     SELECT lower(hex(randomblob(16))), 'order_sequences', sequence_date, 'upsert', '{}', ?
     FROM order_sequences
     WHERE tenant_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM sync_acks WHERE entity = 'order_sequences' AND entity_id = order_sequences.sequence_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM sync_queue WHERE entity = 'order_sequences' AND entity_id = order_sequences.sequence_date
       )`,
    [now, tenantId],
  );
}
