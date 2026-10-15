import type { Tenant, User, UserRole } from '../../domain/models/auth';
import { isSubscriptionStatus, isUserRole } from '../../domain/models/auth';
import { getSupabase } from './supabaseClient';

export class RemoteAuthUnavailable extends Error {
  constructor(message = 'The sign-in service is unreachable.') {
    super(message);
    this.name = 'RemoteAuthUnavailable';
  }
}

export type RemoteLoginResult =
  | { ok: true; user: User; tenant: Tenant }
  | {
      ok: false;
      reason: 'invalid' | 'inactive' | 'ambiguous' | 'locked';
      userId?: string;
      tenantId?: string;
    };

type LoginPayload = {
  ok?: boolean;
  reason?: string;
  user_id?: string;
  tenant_id?: string;
  user?: {
    id?: string;
    tenant_id?: string;
    mobile_number?: string;
    name?: string;
    role?: string;
    is_active?: boolean;
  };
  tenant?: {
    id?: string;
    business_name?: string;
    license_number?: string;
    address?: string;
    subscription_status?: string;
    table_count?: number;
    inactivity_timeout_minutes?: number;
  };
};

export async function loginRemotely(mobileNumber: string, mpin: string): Promise<RemoteLoginResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new RemoteAuthUnavailable();
  }

  const { data, error } = await supabase.rpc('login_with_mpin', {
    p_mobile: mobileNumber,
    p_mpin: mpin,
  });

  if (error || !data) {
    throw new RemoteAuthUnavailable(error?.message);
  }

  const payload = data as LoginPayload;
  if (!payload.ok) {
    const reason = payload.reason;
    if (reason === 'inactive' || reason === 'ambiguous' || reason === 'locked') {
      return {
        ok: false,
        reason,
        userId: payload.user_id,
        tenantId: payload.tenant_id,
      };
    }
    return { ok: false, reason: 'invalid' };
  }

  const role = payload.user?.role;
  if (
    !payload.user?.id ||
    !payload.user.tenant_id ||
    !payload.user.mobile_number ||
    !payload.user.name ||
    !role ||
    !isUserRole(role) ||
    !payload.tenant?.id ||
    !payload.tenant.business_name ||
    !payload.tenant.license_number ||
    typeof payload.tenant.inactivity_timeout_minutes !== 'number'
  ) {
    throw new RemoteAuthUnavailable('Sign-in returned an incomplete profile.');
  }

  const userRole: UserRole = role;
  return {
    ok: true,
    user: {
      id: payload.user.id,
      tenantId: payload.user.tenant_id,
      mobileNumber: payload.user.mobile_number,
      name: payload.user.name,
      role: userRole,
      isActive: payload.user.is_active !== false,
    },
    tenant: {
      id: payload.tenant.id,
      businessName: payload.tenant.business_name,
      licenseNumber: payload.tenant.license_number,
      address: payload.tenant.address ?? '',
      subscriptionStatus: isSubscriptionStatus(payload.tenant.subscription_status)
        ? payload.tenant.subscription_status
        : 'active',
      tableCount: normalizeRemoteTableCount(payload.tenant.table_count),
      inactivityTimeoutMinutes: payload.tenant.inactivity_timeout_minutes,
    },
  };
}

type ProfileRpcResult = { ok?: boolean; reason?: string };

export async function updateAccountRemotely(input: {
  mobileNumber: string;
  currentMpin: string;
  name: string;
  newMpin: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return callProfileRpc('update_own_account', {
    p_mobile: input.mobileNumber,
    p_current_mpin: input.currentMpin,
    p_name: input.name,
    p_new_mpin: input.newMpin,
  });
}

export async function updateTableCountRemotely(input: {
  mobileNumber: string;
  currentMpin: string;
  tableCount: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return callProfileRpc('update_table_count', {
    p_mobile: input.mobileNumber,
    p_current_mpin: input.currentMpin,
    p_table_count: input.tableCount,
  });
}

export async function updateTenantRemotely(input: {
  mobileNumber: string;
  currentMpin: string;
  businessName: string;
  address: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return callProfileRpc('update_tenant_profile', {
    p_mobile: input.mobileNumber,
    p_current_mpin: input.currentMpin,
    p_business_name: input.businessName,
    p_address: input.address,
  });
}

function normalizeRemoteTableCount(value: number | undefined): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return 10;
  }
  return count;
}

async function callProfileRpc(
  fn: 'update_own_account' | 'update_tenant_profile' | 'update_table_count',
  args: Record<string, string | number>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new RemoteAuthUnavailable();
  }

  const { data, error } = await supabase.rpc(fn, args);
  if (error || !data) {
    throw new RemoteAuthUnavailable(error?.message);
  }

  const payload = data as ProfileRpcResult;
  if (!payload.ok) {
    return { ok: false, reason: payload.reason ?? 'unknown' };
  }
  return { ok: true };
}
