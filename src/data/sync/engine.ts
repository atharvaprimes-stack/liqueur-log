import type { SQLiteDatabase } from 'expo-sqlite';

import { getSessionCredentials } from '../../security/sessionCredentials';
import { withDatabase, withLockedTransaction } from '../local/database';
import { isDeviceOnline } from '../network';
import { pullSyncSnapshot, pushSyncBatch } from '../remote/ledgerRemote';
import { pushPendingUsers } from '../remote/syncStaff';
import { isSupabaseConfigured } from '../remote/supabaseClient';
import { emitLedgerUpdated } from './ledgerEvents';
import { enqueueUpsert } from './outbox';
import { applySnapshot } from './merge';
import { broadcastLedgerChanged } from './peerNudge';
import { textField, type SyncChange, type SyncSnapshot } from './snapshot';

const CHUNK_SIZE = 80;
/** Debounce before pushing local cart/table edits so rapid taps batch into one upload. */
const RETRY_DELAY_MS = 1000;
/** Coalesce rapid peer nudges into one pull. */
const PEER_NUDGE_DEBOUNCE_MS = 400;
/** Avoid stampedes of full snapshot pulls when many screens focus in a short window. */
const BACKGROUND_FULL_SYNC_MIN_MS = 30_000;

const UPSERT_PHASES = [
  ['item_types', 'item_strengths', 'vendors', 'items'],
  ['stock_movements', 'purchases', 'order_sequences'],
  ['orders', 'activity_logs'],
] as const;

const DELETE_ENTITIES = ['items', 'item_types', 'item_strengths', 'vendors', 'orders'] as const;

/** Catalog tables that were previously false-acked on unique_violation. */
const CATALOG_ENTITIES = ['item_types', 'item_strengths', 'vendors', 'items'] as const;

let flushing: Promise<void> | null = null;
let pendingFull = false;
let pendingPush = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let peerNudgeTimer: ReturnType<typeof setTimeout> | null = null;
let lastFullSyncAt = 0;

function clearSyncTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Debounced outbox push only (no snapshot pull). Used after local mutations so
 * the UI stays free of exclusive snapshot locks.
 */
export function requestSync(): void {
  if (!isSupabaseConfigured()) {
    return;
  }
  clearSyncTimer();
  timer = setTimeout(() => {
    timer = null;
    void pushNow().catch(() => undefined);
  }, RETRY_DELAY_MS);
}

/** Upload pending local changes without pulling the tenant snapshot. */
export function pushNow(): Promise<void> {
  clearSyncTimer();
  return enqueueSync('push');
}

/** Pushes local changes, then pulls the tenant snapshot. Safe to call repeatedly. */
export function syncNow(): Promise<void> {
  clearSyncTimer();
  return enqueueSync('full');
}

/**
 * Screen-focus friendly sync: full pull at most every 30s; otherwise just flush the outbox.
 * Returns true when a full snapshot sync ran (callers may reload local UI afterward).
 */
export function scheduleBackgroundSync(options?: { force?: boolean }): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return Promise.resolve(false);
  }
  const now = Date.now();
  if (!options?.force && now - lastFullSyncAt < BACKGROUND_FULL_SYNC_MIN_MS) {
    requestSync();
    return Promise.resolve(false);
  }
  return syncNow()
    .then(() => true)
    .catch(() => false);
}

/**
 * Peer device signaled a ledger change. Pull in the background (debounced).
 * Does nothing meaningful offline — local SQLite remains the source of truth.
 */
export function syncAfterPeerNudge(): void {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (peerNudgeTimer) {
    clearTimeout(peerNudgeTimer);
  }
  peerNudgeTimer = setTimeout(() => {
    peerNudgeTimer = null;
    void syncNow()
      .then(() => {
        emitLedgerUpdated();
      })
      .catch(() => undefined);
  }, PEER_NUDGE_DEBOUNCE_MS);
}

function enqueueSync(mode: 'push' | 'full'): Promise<void> {
  if (mode === 'full') {
    pendingFull = true;
  } else {
    pendingPush = true;
  }
  if (!flushing) {
    flushing = (async () => {
      for (;;) {
        const doFull = pendingFull;
        pendingFull = false;
        pendingPush = false;
        if (doFull) {
          await runSync();
        } else {
          await runPush();
        }
        if (!pendingFull && !pendingPush) {
          break;
        }
      }
    })().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function resolveSyncTenant(): Promise<{
  mobileNumber: string;
  mpin: string;
  tenantId: string;
} | null> {
  const credentials = getSessionCredentials();
  if (!credentials) {
    console.warn('[sync] skipped: no session credentials (re-login required)');
    return null;
  }
  if (!isSupabaseConfigured() || !(await isDeviceOnline())) {
    return null;
  }

  const tenantId = await withDatabase(async (database) => {
    const session = await database.getFirstAsync<{ tenant_id: string }>(
      `SELECT tenant_id FROM sessions WHERE id = 'current'`,
    );
    return session?.tenant_id ?? null;
  });
  if (!tenantId) {
    return null;
  }

  await withDatabase(async (database) => {
    await backfillAdjustments(database, tenantId);
    await queueUnacked(database, tenantId);
  });

  return { mobileNumber: credentials.mobileNumber, mpin: credentials.mpin, tenantId };
}

async function pushOutbox(
  mobileNumber: string,
  mpin: string,
  tenantId: string,
): Promise<{ ok: boolean; pushed: number }> {
  const usersReady = await pushPendingUsers();
  if (!usersReady) {
    return { ok: false, pushed: 0 };
  }
  let pushed = 0;
  for (const entities of UPSERT_PHASES) {
    const phase = await pushPhase(mobileNumber, mpin, tenantId, entities, 'upsert');
    if (!phase.ok) {
      return { ok: false, pushed };
    }
    pushed += phase.pushed;
  }
  const deleted = await pushPhase(mobileNumber, mpin, tenantId, DELETE_ENTITIES, 'delete');
  if (!deleted.ok) {
    return { ok: false, pushed };
  }
  return { ok: true, pushed: pushed + deleted.pushed };
}

function notifyPeersIfPushed(tenantId: string, pushed: number): void {
  if (pushed > 0) {
    broadcastLedgerChanged(tenantId);
  }
}

async function runPush(): Promise<void> {
  const ctx = await resolveSyncTenant();
  if (!ctx) {
    return;
  }
  const result = await pushOutbox(ctx.mobileNumber, ctx.mpin, ctx.tenantId);
  if (result.ok) {
    notifyPeersIfPushed(ctx.tenantId, result.pushed);
  }
}

async function runSync(): Promise<void> {
  const ctx = await resolveSyncTenant();
  if (!ctx) {
    return;
  }

  const pushed = await pushOutbox(ctx.mobileNumber, ctx.mpin, ctx.tenantId);
  if (!pushed.ok) {
    await pullTenant(ctx.mobileNumber, ctx.mpin, ctx.tenantId);
    return;
  }
  notifyPeersIfPushed(ctx.tenantId, pushed.pushed);

  const requeued = await pullTenant(ctx.mobileNumber, ctx.mpin, ctx.tenantId);
  // Rows false-acked before the server fix need a second push after re-queue.
  if (requeued > 0) {
    const catalog = await pushPhase(ctx.mobileNumber, ctx.mpin, ctx.tenantId, CATALOG_ENTITIES, 'upsert');
    if (catalog.ok) {
      notifyPeersIfPushed(ctx.tenantId, catalog.pushed);
    }
    await pullTenant(ctx.mobileNumber, ctx.mpin, ctx.tenantId);
  }
}

async function pullTenant(mobileNumber: string, mpin: string, tenantId: string): Promise<number> {
  const snapshot = await pullSyncSnapshot(mobileNumber, mpin);
  if (!snapshot) {
    return 0;
  }
  const requeued = await withLockedTransaction(async (database) => {
    await applySnapshot(database, tenantId, snapshot);
    return requeueCatalogMissingFromRemote(database, tenantId, snapshot);
  });
  // Stamp cooldown only after a successful snapshot apply, not when sync is scheduled.
  lastFullSyncAt = Date.now();
  return requeued;
}

/**
 * Local catalog rows that never landed remotely (false sync ack) are re-queued.
 * Snapshot id set is the source of truth for what the server currently has.
 */
async function requeueCatalogMissingFromRemote(
  database: SQLiteDatabase,
  tenantId: string,
  snapshot: SyncSnapshot,
): Promise<number> {
  const remoteIds: Record<(typeof CATALOG_ENTITIES)[number], Set<string>> = {
    item_types: new Set((snapshot.item_types ?? []).map((row) => textField(row, 'id')).filter(Boolean)),
    item_strengths: new Set((snapshot.item_strengths ?? []).map((row) => textField(row, 'id')).filter(Boolean)),
    vendors: new Set((snapshot.vendors ?? []).map((row) => textField(row, 'id')).filter(Boolean)),
    items: new Set((snapshot.items ?? []).map((row) => textField(row, 'id')).filter(Boolean)),
  };

  let requeued = 0;
  for (const entity of CATALOG_ENTITIES) {
    const rows = await database.getAllAsync<{ id: string }>(
      `SELECT id FROM ${entity} WHERE tenant_id = ?`,
      [tenantId],
    );
    for (const row of rows) {
      if (!row.id || remoteIds[entity].has(row.id)) {
        continue;
      }
      await database.runAsync('DELETE FROM sync_acks WHERE entity = ? AND entity_id = ?', [entity, row.id]);
      await enqueueUpsert(database, entity, row.id);
      requeued += 1;
    }
  }
  return requeued;
}

async function pushPhase(
  mobileNumber: string,
  mpin: string,
  tenantId: string,
  entities: readonly string[],
  operation: 'upsert' | 'delete',
): Promise<{ ok: boolean; pushed: number }> {
  let pushed = 0;
  for (let pass = 0; pass < 100; pass += 1) {
    const changes = await withDatabase((database) => loadChanges(database, tenantId, entities, operation));
    if (changes.length === 0) {
      return { ok: true, pushed };
    }
    const acked = await pushSyncBatch(mobileNumber, mpin, changes);
    if (!acked) {
      return { ok: false, pushed };
    }
    if (acked.length === 0) {
      return { ok: false, pushed };
    }
    const accepted = new Set(acked);
    let acceptedCount = 0;
    await withLockedTransaction(async (database) => {
      for (const change of changes) {
        if (!accepted.has(change.queue_id)) {
          continue;
        }
        acceptedCount += 1;
        await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [change.queue_id]);
        await database.runAsync(
          'INSERT INTO sync_acks (entity, entity_id) VALUES (?, ?) ON CONFLICT(entity, entity_id) DO NOTHING',
          [change.entity, change.entity_id],
        );
      }
    });
    pushed += acceptedCount;
  }
  return { ok: false, pushed };
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
      `SELECT id, order_id, item_id, name_en, name_mr, liquor_type, service_station,
              volume_ml, quantity, unit_price
       FROM order_items WHERE order_id = ?`,
      [entityId],
    );
    return order;
  }

  const tables: Record<string, string> = {
    items: `SELECT id, tenant_id, serial_no, name_en, name_mr, brand, liquor_type, sub_type,
              service_station, show_in_bar, show_in_kitchen, tracks_stock,
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
