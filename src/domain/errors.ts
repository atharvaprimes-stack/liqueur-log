export type AuthFailureReason = 'invalid' | 'inactive' | 'ambiguous' | 'locked';

const AUTH_MESSAGES: Record<AuthFailureReason, string> = {
  invalid: 'Invalid mobile number or MPIN.',
  inactive: 'This account is inactive.',
  ambiguous: 'This mobile number matches more than one business. Contact your provider.',
  locked: 'Too many attempts. Try again in 15 minutes.',
};

export class AuthError extends Error {
  readonly reason: AuthFailureReason;

  constructor(reason: AuthFailureReason) {
    super(AUTH_MESSAGES[reason]);
    this.name = 'AuthError';
    this.reason = reason;
  }
}

export class StaffAccessError extends Error {
  constructor() {
    super('Only an admin can manage staff.');
    this.name = 'StaffAccessError';
  }
}

export class ProfileError extends Error {
  readonly code:
    | 'name'
    | 'business'
    | 'address'
    | 'tables'
    | 'mpin'
    | 'mismatch'
    | 'offline'
    | 'forbidden'
    | 'locked'
    | 'unknown';

  constructor(code: ProfileError['code']) {
    super(code);
    this.name = 'ProfileError';
    this.code = code;
  }
}

export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffValidationError';
  }
}

export const INVENTORY_ERROR_CODES = [
  'supplier',
  'invoice',
  'payment',
  'lines',
  'quantity',
  'price',
  'amount-paid',
  'duplicate-invoice',
  'unknown-item',
  'stock',
  'forbidden',
  'unknown',
  'name',
  'brand',
  'type',
  'volume',
  'threshold',
  'station',
  'sell-below-cost',
  'has-stock',
  'in-use',
  'vendor',
  'phone',
  'duplicate-vendor',
  'label',
  'duplicate-label',
  'label-in-use',
] as const;

export type InventoryErrorCode = (typeof INVENTORY_ERROR_CODES)[number];

export class InventoryAccessError extends Error {
  readonly code = 'forbidden' as const;

  constructor() {
    super('Only an admin can change stock.');
    this.name = 'InventoryAccessError';
  }
}

export class InventoryValidationError extends Error {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode) {
    super(code);
    this.name = 'InventoryValidationError';
    this.code = code;
  }
}

export function inventoryErrorCode(error: unknown): InventoryErrorCode {
  if (error instanceof InventoryValidationError || error instanceof InventoryAccessError) {
    return error.code;
  }
  return 'unknown';
}

export const ORDER_ERROR_CODES = [
  'closed',
  'empty',
  'stock',
  'unknown-item',
  'quantity',
  'payment',
  'amount',
  'table',
  'unknown',
] as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

export class OrderValidationError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode) {
    super(code);
    this.name = 'OrderValidationError';
    this.code = code;
  }
}

export function orderErrorCode(error: unknown): OrderErrorCode {
  if (error instanceof OrderValidationError) {
    return error.code;
  }
  if (error instanceof Error && error.message.includes('closed orders are read-only')) {
    return 'closed';
  }
  return 'unknown';
}
