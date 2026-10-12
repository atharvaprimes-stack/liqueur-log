import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { router } from 'expo-router';

import { authenticate, clearSession, recordInteraction, restoreSession } from '../data/repositories/authRepository';
import { flushSyncQueue } from '../data/remote/syncStaff';
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

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) {
          return;
        }
        setCurrentUser(session?.user ?? null);
        setCurrentTenant(session?.tenant ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
          setCurrentTenant(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (mobileNumber: string, mpin: string) => {
    const session = await authenticate(mobileNumber, mpin);
    if (session.user.role === 'ADMIN') {
      void flushSyncQueue();
    }
    setCurrentUser(session.user);
    setCurrentTenant(session.tenant);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setCurrentUser(null);
    setCurrentTenant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, currentTenant, isReady, login, logout }}>
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
      className="flex-1 bg-stone-950"
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
