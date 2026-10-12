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

export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffValidationError';
  }
}
