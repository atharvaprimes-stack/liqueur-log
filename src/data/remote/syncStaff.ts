import type { StaffRecord } from '../../domain/usecases/ManageStaffUseCase';
import { getDatabase } from '../local/database';
import { isDeviceOnline } from '../network';
import { getSessionCredentials } from '../../security/sessionCredentials';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

type QueueRow = {
  id: string;
  payload: string;
};

type SyncResponse = {
  ok: boolean;
  reason?: string;
};

let flushing: Promise<void> | null = null;

export async function enqueueStaffSync(record: StaffRecord): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at)
     VALUES (?, 'users', ?, 'upsert', ?, ?)`,
    [crypto.randomUUID(), record.id, JSON.stringify(record), Date.now()],
  );
}

export function flushSyncQueue(): Promise<void> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

export async function hasPendingUserSync(userId: string): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_queue WHERE entity = 'users' AND entity_id = ? LIMIT 1`,
    [userId],
  );
  return Boolean(row);
}

async function runFlush(): Promise<void> {
  for (;;) {
    const finishedBatch = await flushOnce();
    if (!finishedBatch) {
      return;
    }
  }
}

async function flushOnce(): Promise<boolean> {
  const credentials = getSessionCredentials();
  if (!credentials || !isSupabaseConfigured() || !(await isDeviceOnline())) {
    return false;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<QueueRow>(
    `SELECT id, payload FROM sync_queue WHERE entity = 'users' ORDER BY created_at ASC`,
  );

  if (rows.length === 0) {
    return false;
  }

  for (const row of rows) {
    const record = JSON.parse(row.payload) as StaffRecord;
    const { data, error } = await supabase.rpc('sync_staff_member', {
      p_admin_mobile: credentials.mobileNumber,
      p_admin_mpin: credentials.mpin,
      p_id: record.id,
      p_tenant_id: record.tenantId,
      p_mobile: record.mobileNumber,
      p_mpin_hash: record.mpinHash,
      p_name: record.name,
      p_is_active: record.isActive,
    });

    if (error) {
      return false;
    }

    const response = data as SyncResponse | null;
    if (!response?.ok) {
      if (response?.reason === 'duplicate' || response?.reason === 'validation') {
        await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
        continue;
      }
      return false;
    }

    await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
  }

  return true;
}
