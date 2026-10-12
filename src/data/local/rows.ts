import type { Tenant, User } from '../../domain/models/auth';
import { isUserRole } from '../../domain/models/auth';

export type TenantRow = {
  id: string;
  business_name: string;
  license_number: string;
  inactivity_timeout_minutes: number;
};

export type UserRow = {
  id: string;
  tenant_id: string;
  mobile_number: string;
  mpin_hash: string;
  name: string;
  role: string;
  is_active: number;
};

export type LoginRow = UserRow & {
  business_name: string;
  license_number: string;
  inactivity_timeout_minutes: number;
};

export function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    businessName: row.business_name,
    licenseNumber: row.license_number,
    inactivityTimeoutMinutes: row.inactivity_timeout_minutes,
  };
}

export function mapUser(row: UserRow): User | null {
  if (!isUserRole(row.role)) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    mobileNumber: row.mobile_number,
    name: row.name,
    role: row.role,
    isActive: row.is_active === 1,
  };
}
