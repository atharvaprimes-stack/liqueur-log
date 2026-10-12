import { AuthError } from '../../domain/errors';
import type { AuthSession } from '../../domain/models/auth';
import { MOBILE_PATTERN, MPIN_PATTERN } from '../../domain/models/auth';
import { hashMpin, verifyMpin } from '../../security/mpin';
import {
  clearSessionCredentials,
  setSessionCredentials,
  setSessionInteractionAt,
} from '../../security/sessionCredentials';
import { getDatabase } from '../local/database';
import { mapTenant, mapUser, type LoginRow, type TenantRow, type UserRow } from '../local/rows';
import { isDeviceOnline } from '../network';
import { loginRemotely, RemoteAuthUnavailable } from '../remote/authRemote';
import { hasPendingUserSync } from '../remote/syncStaff';
import { isSupabaseConfigured } from '../remote/supabaseClient';

const CURRENT_SESSION_ID = 'current';

type SessionRow = {
  user_id: string;
  tenant_id: string;
  last_interaction_at: number;
};

export async function authenticate(mobileNumber: string, mpin: string): Promise<AuthSession> {
  const mobile = mobileNumber.trim();
  const pin = mpin.trim();
  if (!MOBILE_PATTERN.test(mobile) || !MPIN_PATTERN.test(pin)) {
    throw new AuthError('invalid');
  }

  if (isSupabaseConfigured() && (await isDeviceOnline())) {
    try {
      const remote = await loginRemotely(mobile, pin);
      if (remote.ok) {
        const session = { user: remote.user, tenant: remote.tenant };
        await persistSession(session, await hashMpin(pin));
        rememberCredentials(session, mobile, pin);
        return session;
      }

      if (remote.reason === 'inactive') {
        if (remote.userId) {
          await deactivateLocalUser(remote.userId);
        }
        throw new AuthError('inactive');
      }

      if (remote.reason === 'locked' || remote.reason === 'ambiguous') {
        throw new AuthError(remote.reason);
      }

      const pending = await matchLocalSession(mobile, pin);
      if (pending && (await hasPendingUserSync(pending.user.id))) {
        await persistSession(pending, await currentHash(pending.user.id));
        rememberCredentials(pending, mobile, pin);
        return pending;
      }

      throw new AuthError('invalid');
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (!(error instanceof RemoteAuthUnavailable)) {
        const local = await matchLocalSession(mobile, pin);
        if (local) {
          await persistSession(local, await currentHash(local.user.id));
          rememberCredentials(local, mobile, pin);
          return local;
        }
        throw new AuthError('invalid');
      }
    }
  }

  const local = await matchLocalSession(mobile, pin);
  if (!local) {
    throw new AuthError('invalid');
  }

  await persistSession(local, await currentHash(local.user.id));
  rememberCredentials(local, mobile, pin);
  return local;
}

export async function restoreSession(): Promise<AuthSession | null> {
  const database = await getDatabase();
  const session = await database.getFirstAsync<SessionRow>(
    'SELECT user_id, tenant_id, last_interaction_at FROM sessions WHERE id = ?',
    [CURRENT_SESSION_ID],
  );
  if (!session) {
    return null;
  }

  const userRow = await database.getFirstAsync<UserRow>(
    `SELECT id, tenant_id, mobile_number, mpin_hash, name, role, is_active
     FROM users WHERE id = ?`,
    [session.user_id],
  );
  const tenantRow = await database.getFirstAsync<TenantRow>(
    `SELECT id, business_name, license_number, inactivity_timeout_minutes
     FROM tenants WHERE id = ?`,
    [session.tenant_id],
  );
  const user = userRow ? mapUser(userRow) : null;
  const tenant = tenantRow ? mapTenant(tenantRow) : null;

  if (!user || !tenant || !user.isActive || user.tenantId !== tenant.id) {
    await clearSession();
    return null;
  }

  const timeoutMs = timeoutMinutes(tenant.inactivityTimeoutMinutes) * 60 * 1000;
  if (Date.now() - session.last_interaction_at >= timeoutMs) {
    await clearSession();
    return null;
  }

  setSessionInteractionAt(session.last_interaction_at);
  return { user, tenant };
}

export async function clearSession(): Promise<void> {
  clearSessionCredentials();
  setSessionInteractionAt(0);
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sessions');
}

export async function recordInteraction(at: number): Promise<void> {
  setSessionInteractionAt(at);
  const database = await getDatabase();
  await database.runAsync('UPDATE sessions SET last_interaction_at = ? WHERE id = ?', [
    at,
    CURRENT_SESSION_ID,
  ]);
}

async function matchLocalSession(mobile: string, pin: string): Promise<AuthSession | null> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<LoginRow>(
    `SELECT
       users.id,
       users.tenant_id,
       users.mobile_number,
       users.mpin_hash,
       users.name,
       users.role,
       users.is_active,
       tenants.business_name,
       tenants.license_number,
       tenants.inactivity_timeout_minutes
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.mobile_number = ?`,
    [mobile],
  );

  const matches: LoginRow[] = [];
  for (const row of rows) {
    if (await verifyMpin(pin, row.mpin_hash)) {
      matches.push(row);
    }
  }

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new AuthError('ambiguous');
  }

  const user = mapUser(matches[0]);
  if (!user) {
    return null;
  }
  if (!user.isActive) {
    throw new AuthError('inactive');
  }

  return {
    user,
    tenant: {
      id: matches[0].tenant_id,
      businessName: matches[0].business_name,
      licenseNumber: matches[0].license_number,
      inactivityTimeoutMinutes: matches[0].inactivity_timeout_minutes,
    },
  };
}

async function persistSession(session: AuthSession, mpinHash: string): Promise<void> {
  const database = await getDatabase();
  const now = Date.now();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO tenants (id, business_name, license_number, inactivity_timeout_minutes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         business_name = excluded.business_name,
         license_number = excluded.license_number,
         inactivity_timeout_minutes = excluded.inactivity_timeout_minutes`,
      [
        session.tenant.id,
        session.tenant.businessName,
        session.tenant.licenseNumber,
        session.tenant.inactivityTimeoutMinutes,
      ],
    );
    await database.runAsync(
      `INSERT INTO users (id, tenant_id, mobile_number, mpin_hash, name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         mobile_number = excluded.mobile_number,
         mpin_hash = excluded.mpin_hash,
         name = excluded.name,
         role = excluded.role,
         is_active = excluded.is_active`,
      [
        session.user.id,
        session.user.tenantId,
        session.user.mobileNumber,
        mpinHash,
        session.user.name,
        session.user.role,
        session.user.isActive ? 1 : 0,
      ],
    );
    await database.runAsync('DELETE FROM sessions');
    await database.runAsync(
      'INSERT INTO sessions (id, user_id, tenant_id, last_interaction_at) VALUES (?, ?, ?, ?)',
      [CURRENT_SESSION_ID, session.user.id, session.tenant.id, now],
    );
  });
  setSessionInteractionAt(now);
}

async function currentHash(userId: string): Promise<string> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ mpin_hash: string }>(
    'SELECT mpin_hash FROM users WHERE id = ?',
    [userId],
  );
  if (!row) {
    throw new AuthError('invalid');
  }
  return row.mpin_hash;
}

async function deactivateLocalUser(userId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
}

function rememberCredentials(session: AuthSession, mobile: string, pin: string): void {
  if (session.user.role === 'ADMIN') {
    setSessionCredentials({ mobileNumber: mobile, mpin: pin });
    return;
  }
  clearSessionCredentials();
}

function timeoutMinutes(minutes: number): number {
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}
