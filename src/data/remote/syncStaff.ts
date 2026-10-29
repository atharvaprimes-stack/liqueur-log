import type { StaffRecord } from '../../domain/usecases/ManageStaffUseCase';
import { newId } from '../../security/id';
import { getSessionCredentials } from '../../security/sessionCredentials';
import { getDatabase } from '../local/database';
import { isDeviceOnline } from '../network';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

type QueueRow = {
  id: string;
  payload: string;
};

type SyncResponse = {
  ok: boolean;
  reason?: string;
};

export async function enqueueStaffSync(record: StaffRecord): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?', ['users', record.id]);
  await database.runAsync(
    `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at)
     VALUES (?, 'users', ?, 'upsert', ?, ?)`,
    [newId(), record.id, JSON.stringify(record), Date.now()],
  );
}

export async function hasPendingUserSync(userId: string): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_queue WHERE entity = 'users' AND entity_id = ? LIMIT 1`,
    [userId],
  );
  return Boolean(row);
}

/** Pushes queued staff rows. Returns false when the request itself failed. */
export async function pushPendingUsers(): Promise<boolean> {
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
    return true;
  }

  for (const row of rows) {
    let record: StaffRecord;
    try {
      record = JSON.parse(row.payload) as StaffRecord;
    } catch {
      await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
      continue;
    }
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
    await database.runAsync(
      'INSERT INTO sync_acks (entity, entity_id) VALUES (?, ?) ON CONFLICT(entity, entity_id) DO NOTHING',
      ['users', record.id],
    );
  }

  return true;
}
