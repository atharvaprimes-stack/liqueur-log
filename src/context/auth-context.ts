import { createContext, useContext } from 'react';

import type { Tenant, User } from '../domain/models/auth';

export type AuthContextValue = {
  currentUser: User | null;
  currentTenant: Tenant | null;
  isReady: boolean;
  login: (mobileNumber: string, mpin: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return value;
}
