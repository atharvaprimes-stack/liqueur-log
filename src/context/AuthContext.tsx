import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { router } from 'expo-router';

import { initDatabase } from '../data/local/database';
import {
  authenticate,
  clearSession,
  recordInteraction,
  restoreSession,
  updateOwnAccount,
  updateOwnTenant,
  updateTableCount as saveTableCount,
} from '../data/repositories/authRepository';
import { syncNow } from '../data/sync/engine';
import type { Tenant, User } from '../domain/models/auth';
import { getSessionInteractionAt, setSessionInteractionAt } from '../security/sessionCredentials';
import { AuthContext, useAuth } from './auth-context';

const PERSIST_DELAY_MS = 5000;

export function inactivityTimeoutMs(minutes: number): number {
  const value = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  return value * 60 * 1000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Native APK: wait for SQLite open + schema before any UI query.
        await initDatabase();
        if (cancelled) {
          return;
        }

        const session = await restoreSession();
        if (cancelled) {
          return;
        }
        setDatabaseError(null);
        setCurrentUser(session?.user ?? null);
        setCurrentTenant(session?.tenant ?? null);
      } catch (error) {
        console.error('[auth] startup failed', error);
        if (!cancelled) {
          setCurrentUser(null);
          setCurrentTenant(null);
          setDatabaseError(error instanceof Error ? error.message : 'Local database failed to start.');
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (mobileNumber: string, mpin: string) => {
    const session = await authenticate(mobileNumber, mpin);
    setCurrentUser(session.user);
    setCurrentTenant(session.tenant);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncNow();
      }
    });
    return () => subscription.remove();
  }, [currentUser]);

  const logout = useCallback(async () => {
    await clearSession();
    setCurrentUser(null);
    setCurrentTenant(null);
  }, []);

  const updateAccount = useCallback(
    async (input: { name: string; currentMpin: string; newMpin: string }) => {
      if (!currentUser) {
        return;
      }
      const user = await updateOwnAccount({ user: currentUser, ...input });
      setCurrentUser(user);
    },
    [currentUser],
  );

  const updateTableCount = useCallback(
    async (input: { tableCount: number; currentMpin: string }) => {
      if (!currentUser || !currentTenant) {
        return;
      }
      const tenant = await saveTableCount({ user: currentUser, tenant: currentTenant, ...input });
      setCurrentTenant(tenant);
    },
    [currentTenant, currentUser],
  );

  const updateTenant = useCallback(
    async (input: { businessName: string; address: string; currentMpin: string }) => {
      if (!currentUser || !currentTenant) {
        return;
      }
      const tenant = await updateOwnTenant({ user: currentUser, tenant: currentTenant, ...input });
      setCurrentTenant(tenant);
    },
    [currentTenant, currentUser],
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentTenant,
        isReady,
        databaseError,
        login,
        logout,
        updateAccount,
        updateTenant,
        updateTableCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const { currentUser, currentTenant, logout } = useAuth();
  const lastInteractionRef = useRef(0);
  const trackedUserId = useRef<string | null>(null);
  const expiring = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = currentUser?.id ?? null;

  if (userId !== trackedUserId.current) {
    trackedUserId.current = userId;
    lastInteractionRef.current = userId ? getSessionInteractionAt() || Date.now() : 0;
  }

  const markInteraction = useCallback(() => {
    if (!trackedUserId.current) {
      return;
    }

    const now = Date.now();
    lastInteractionRef.current = now;
    setSessionInteractionAt(now);
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
    }
    persistTimer.current = setTimeout(() => {
      void recordInteraction(now);
    }, PERSIST_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!currentUser || !currentTenant) {
      return;
    }

    const timeoutMs = inactivityTimeoutMs(currentTenant.inactivityTimeoutMinutes);

    const expire = () => {
      if (expiring.current) {
        return;
      }
      expiring.current = true;
      void logout()
        .catch(() => undefined)
        .finally(() => {
          router.replace('/login');
          expiring.current = false;
        });
    };

    const expireIfNeeded = () => {
      if (Date.now() - lastInteractionRef.current >= timeoutMs) {
        expire();
      }
    };

    expireIfNeeded();
    const timer = setInterval(expireIfNeeded, 5000);
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        expireIfNeeded();
      }
      if (nextState === 'background' || nextState === 'inactive') {
        if (persistTimer.current) {
          clearTimeout(persistTimer.current);
          persistTimer.current = null;
        }
        void recordInteraction(lastInteractionRef.current);
      }
    });

    const target = globalThis as {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
    };
    target.addEventListener?.('pointerdown', markInteraction);
    target.addEventListener?.('keydown', markInteraction);

    return () => {
      clearInterval(timer);
      appState.remove();
      target.removeEventListener?.('pointerdown', markInteraction);
      target.removeEventListener?.('keydown', markInteraction);
    };
  }, [currentTenant, currentUser, logout, markInteraction]);

  return (
    <View
      className="flex-1"
      style={{ flex: 1 }}
      onTouchStart={markInteraction}
      onStartShouldSetResponderCapture={() => {
        markInteraction();
        return false;
      }}
    >
      {children}
    </View>
  );
}

export { useAuth };
