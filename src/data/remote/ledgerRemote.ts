import { getSupabase } from './supabaseClient';
import { asRecord, type SyncChange, type SyncSnapshot } from '../sync/snapshot';

type PushResponse = {
  ok?: boolean;
  acked?: string[];
};

export async function pushSyncBatch(
  mobileNumber: string,
  mpin: string,
  changes: SyncChange[],
): Promise<string[] | null> {
  const supabase = getSupabase();
  if (!supabase || changes.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('push_sync_batch', {
    p_mobile: mobileNumber,
    p_mpin: mpin,
    p_batch: { changes },
  });
  if (error) {
    return null;
  }

  const payload = asRecord(data) as PushResponse | null;
  if (!payload?.ok || !Array.isArray(payload.acked)) {
    return null;
  }
  return payload.acked.filter((id): id is string => typeof id === 'string');
}

export async function pullSyncSnapshot(mobileNumber: string, mpin: string): Promise<SyncSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc('pull_sync_snapshot', {
    p_mobile: mobileNumber,
    p_mpin: mpin,
  });
  if (error) {
    return null;
  }

  const payload = asRecord(data);
  if (!payload || payload.ok === false) {
    return null;
  }
  return payload as SyncSnapshot;
}
