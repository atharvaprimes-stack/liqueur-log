import {
  isTableRequestStatus,
  normalizeTableId,
  type TableRequest,
  type TableRequestStatus,
} from '../../domain/models/tableRequests';
import { getSessionCredentials } from '../../security/sessionCredentials';
import { getSupabase } from './supabaseClient';

type ListPayload = {
  ok?: boolean;
  requests?: unknown;
};

type MutationPayload = {
  ok?: boolean;
};

type StatusWrite = Extract<TableRequestStatus, 'accepted' | 'rejected' | 'closed'>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseTableRequest(raw: unknown): TableRequest | null {
  const row = asRecord(raw);
  if (!row) {
    return null;
  }

  const id = asString(row.id);
  const tenantId = asString(row.tenant_id);
  const tableIdRaw = asString(row.table_id);
  const itemId = asString(row.item_id);
  const statusRaw = asString(row.status);
  const quantity = asNumber(row.quantity);
  const unitPrice = asNumber(row.unit_price);
  const createdAt = asNumber(row.created_at);
  const updatedAt = asNumber(row.updated_at);

  if (
    !id ||
    !tenantId ||
    !tableIdRaw ||
    !itemId ||
    !statusRaw ||
    !isTableRequestStatus(statusRaw) ||
    quantity === null ||
    quantity < 1 ||
    unitPrice === null ||
    unitPrice < 0 ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    id,
    tenantId,
    tableId: normalizeTableId(tableIdRaw),
    itemId,
    nameEn: typeof row.name_en === 'string' ? row.name_en : '',
    nameMr: typeof row.name_mr === 'string' ? row.name_mr : '',
    quantity: Math.trunc(quantity),
    unitPrice,
    status: statusRaw,
    createdAt,
    updatedAt,
  };
}

function requireCredentials(): { mobileNumber: string; mpin: string } | null {
  return getSessionCredentials();
}

async function updateStatusDirect(
  requestIds: string[],
  status: StatusWrite,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || requestIds.length === 0) {
    return requestIds.length === 0;
  }

  const updatedAt = Date.now();
  const { data, error } = await supabase
    .from('table_requests')
    .update({ status, updated_at: updatedAt })
    .in('id', requestIds)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function updateStatusViaRpc(requestId: string, status: StatusWrite): Promise<boolean> {
  const supabase = getSupabase();
  const credentials = requireCredentials();
  if (!supabase || !credentials) {
    return false;
  }

  const { data, error } = await supabase.rpc('update_table_request_status', {
    p_mobile: credentials.mobileNumber,
    p_mpin: credentials.mpin,
    p_request_id: requestId,
    p_status: status,
  });
  if (error) {
    return false;
  }

  const payload = asRecord(data) as MutationPayload | null;
  return payload?.ok === true;
}

async function updateStatusBulkViaRpc(requestIds: string[], status: StatusWrite): Promise<boolean> {
  const supabase = getSupabase();
  const credentials = requireCredentials();
  if (!supabase || !credentials || requestIds.length === 0) {
    return requestIds.length === 0;
  }

  const { data, error } = await supabase.rpc('update_table_requests_status_bulk', {
    p_mobile: credentials.mobileNumber,
    p_mpin: credentials.mpin,
    p_request_ids: requestIds,
    p_status: status,
  });
  if (error) {
    return false;
  }

  const payload = asRecord(data) as MutationPayload | null;
  return payload?.ok === true;
}

export async function listTableRequestsRemote(tenantId?: string | null): Promise<TableRequest[] | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  // Prefer direct select — works after session restore without in-memory MPIN.
  let query = supabase
    .from('table_requests')
    .select('*')
    .in('status', ['pending', 'accepted', 'rejected'])
    .order('created_at', { ascending: true });
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;

  if (!error && Array.isArray(data)) {
    return data
      .map(parseTableRequest)
      .filter((request): request is TableRequest => request !== null);
  }

  const credentials = requireCredentials();
  if (!credentials) {
    return null;
  }

  const rpc = await supabase.rpc('list_table_requests', {
    p_mobile: credentials.mobileNumber,
    p_mpin: credentials.mpin,
  });
  if (rpc.error) {
    return null;
  }

  const payload = asRecord(rpc.data) as ListPayload | null;
  if (!payload?.ok || !Array.isArray(payload.requests)) {
    return null;
  }

  return payload.requests
    .map(parseTableRequest)
    .filter((request): request is TableRequest => request !== null);
}

export async function updateTableRequestStatusRemote(
  requestId: string,
  status: StatusWrite,
): Promise<boolean> {
  if (await updateStatusDirect([requestId], status)) {
    return true;
  }
  return updateStatusViaRpc(requestId, status);
}

export async function updateTableRequestsStatusBulkRemote(
  requestIds: string[],
  status: StatusWrite,
): Promise<boolean> {
  if (requestIds.length === 0) {
    return true;
  }
  if (await updateStatusDirect(requestIds, status)) {
    return true;
  }
  return updateStatusBulkViaRpc(requestIds, status);
}

export async function closeTableRequestsRemote(tableId: string, tenantId?: string | null): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const normalized = normalizeTableId(tableId);
  const updatedAt = Date.now();

  if (tenantId) {
    const { error } = await supabase
      .from('table_requests')
      .update({ status: 'closed', updated_at: updatedAt })
      .eq('tenant_id', tenantId)
      .eq('table_id', normalized)
      .in('status', ['pending', 'accepted', 'rejected']);
    if (!error) {
      return true;
    }
  }

  const credentials = requireCredentials();
  if (!credentials) {
    return false;
  }

  const { data, error } = await supabase.rpc('close_table_requests', {
    p_mobile: credentials.mobileNumber,
    p_mpin: credentials.mpin,
    p_table_id: normalized,
  });
  if (error) {
    return false;
  }

  const payload = asRecord(data) as MutationPayload | null;
  return payload?.ok === true;
}

export async function registerDevicePushTokenRemote(input: {
  tenantId: string;
  token: string;
  platform: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !input.token.trim()) {
    return false;
  }

  const updatedAt = Date.now();
  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      tenant_id: input.tenantId,
      token: input.token.trim(),
      platform: input.platform,
      updated_at: updatedAt,
    },
    { onConflict: 'token' },
  );
  return !error;
}
