export type UserRole = 'ADMIN' | 'STAFF';

export type User = {
  id: string;
  tenantId: string;
  mobileNumber: string;
  name: string;
  role: UserRole;
  isActive: boolean;
};

export const SUBSCRIPTION_STATUSES = ['active', 'suspended', 'on-hold'] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type Tenant = {
  id: string;
  businessName: string;
  licenseNumber: string;
  address: string;
  subscriptionStatus: SubscriptionStatus;
  tableCount: number;
  inactivityTimeoutMinutes: number;
};

export function isSubscriptionStatus(value: string | null | undefined): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.some((status) => status === value);
}

export type AuthSession = {
  user: User;
  tenant: Tenant;
};

export const MOBILE_PATTERN = /^[0-9]{10}$/;
export const MPIN_PATTERN = /^[0-9]{4}$/;

export function isUserRole(value: string): value is UserRole {
  return value === 'ADMIN' || value === 'STAFF';
}
