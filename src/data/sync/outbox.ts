import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../security/id';

export async function queueChange(
  database: SQLiteDatabase,
  entity: string,
  entityId: string,
  operation: 'upsert' | 'delete',
): Promise<void> {
  await database.runAsync('DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?', [entity, entityId]);
  await database.runAsync(
    `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, '{}', ?)`,
    [newId(), entity, entityId, operation, Date.now()],
  );
}

export async function enqueueUpsert(database: SQLiteDatabase, entity: string, entityId: string): Promise<void> {
  await queueChange(database, entity, entityId, 'upsert');
}

export async function enqueueDelete(database: SQLiteDatabase, entity: string, entityId: string): Promise<void> {
  await queueChange(database, entity, entityId, 'delete');
}

/**
 * Count corrections are the only stock changes that are not already implied by
 * a purchase line or an order line. The id matches the activity row so a
 * replay cannot apply the same correction twice.
 */
export async function recordAdjustment(
  database: SQLiteDatabase,
  input: { id: string; tenantId: string; itemId: string; delta: number; createdAt: number },
): Promise<void> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return;
  }
  await database.runAsync(
    `INSERT INTO stock_movements (id, tenant_id, item_id, delta, reason, source_id, created_at)
     VALUES (?, ?, ?, ?, 'adjust', ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [input.id, input.tenantId, input.itemId, input.delta, input.id, input.createdAt],
  );
  await queueChange(database, 'stock_movements', input.id, 'upsert');
}

export async function rememberAck(database: SQLiteDatabase, entity: string, entityId: string): Promise<void> {
  await database.runAsync('INSERT INTO sync_acks (entity, entity_id) VALUES (?, ?) ON CONFLICT(entity, entity_id) DO NOTHING', [
    entity,
    entityId,
  ]);
}
