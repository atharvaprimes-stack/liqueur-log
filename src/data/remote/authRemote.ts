import type { Tenant, User, UserRole } from '../../domain/models/auth';
import { isUserRole } from '../../domain/models/auth';
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
      inactivityTimeoutMinutes: payload.tenant.inactivity_timeout_minutes,
    },
  };
}
