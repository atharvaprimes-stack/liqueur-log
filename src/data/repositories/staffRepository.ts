import { isUniqueConstraintError, getDatabase } from '../local/database';
import { mapUser, type UserRow } from '../local/rows';
import type { StaffGateway, StaffRecord } from '../../domain/usecases/ManageStaffUseCase';
import { hashMpin } from '../../security/mpin';
import { enqueueStaffSync } from '../remote/syncStaff';
import { syncNow } from '../sync/engine';
import { isUserRole } from '../../domain/models/auth';

export const staffGateway: StaffGateway = {
  listStaff,
  getStaffRecord,
  findMobileOwner,
  commitStaff,
  hashMpin,
};

async function listStaff(tenantId: string) {
  const database = await getDatabase();
  const rows = await database.getAllAsync<UserRow>(
    `SELECT id, tenant_id, mobile_number, mpin_hash, name, role, is_active
     FROM users
     WHERE tenant_id = ? AND role = 'STAFF'
     ORDER BY name COLLATE NOCASE`,
    [tenantId],
  );

  return rows.flatMap((row) => {
    const user = mapUser(row);
    return user ? [user] : [];
  });
}

async function getStaffRecord(tenantId: string, userId: string): Promise<StaffRecord | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<UserRow>(
    `SELECT id, tenant_id, mobile_number, mpin_hash, name, role, is_active
     FROM users
     WHERE id = ? AND tenant_id = ? AND role = 'STAFF'`,
    [userId, tenantId],
  );
  if (!row || row.role !== 'STAFF') {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    mobileNumber: row.mobile_number,
    mpinHash: row.mpin_hash,
    name: row.name,
    role: 'STAFF',
    isActive: row.is_active === 1,
  };
}

async function findMobileOwner(tenantId: string, mobileNumber: string) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE tenant_id = ? AND mobile_number = ?',
    [tenantId, mobileNumber],
  );
  if (!row || !isUserRole(row.role)) {
    return null;
  }
  return { id: row.id, role: row.role };
}

async function commitStaff(record: StaffRecord): Promise<'ok' | 'duplicate' | 'rejected'> {
  const database = await getDatabase();

  try {
    await database.withTransactionAsync(async () => {
      const result = await database.runAsync(
        `INSERT INTO users (id, tenant_id, mobile_number, mpin_hash, name, role, is_active)
         VALUES (?, ?, ?, ?, ?, 'STAFF', ?)
         ON CONFLICT(id) DO UPDATE SET
           mobile_number = excluded.mobile_number,
           mpin_hash = excluded.mpin_hash,
           name = excluded.name,
           is_active = excluded.is_active
         WHERE users.tenant_id = excluded.tenant_id
           AND users.role = 'STAFF'`,
        [
          record.id,
          record.tenantId,
          record.mobileNumber,
          record.mpinHash,
          record.name,
          record.isActive ? 1 : 0,
        ],
      );

      if (result.changes === 0) {
        throw new Error('staff-rejected');
      }

      await enqueueStaffSync(record);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return 'duplicate';
    }
    if (error instanceof Error && error.message === 'staff-rejected') {
      return 'rejected';
    }
    throw error;
  }

  void syncNow();
  return 'ok';
}
