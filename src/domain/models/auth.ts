export type UserRole = 'ADMIN' | 'STAFF';

export type User = {
  id: string;
  tenantId: string;
  mobileNumber: string;
  name: string;
  role: UserRole;
  isActive: boolean;
};

export type Tenant = {
  id: string;
  businessName: string;
  licenseNumber: string;
  inactivityTimeoutMinutes: number;
};

export type AuthSession = {
  user: User;
  tenant: Tenant;
};

export const MOBILE_PATTERN = /^[0-9]{10}$/;
export const MPIN_PATTERN = /^[0-9]{4}$/;

export function isUserRole(value: string): value is UserRole {
  return value === 'ADMIN' || value === 'STAFF';
}
