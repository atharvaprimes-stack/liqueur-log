import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../context/auth-context';
import { newId } from '../../security/id';
import { StaffAccessError, StaffValidationError } from '../errors';
import { MOBILE_PATTERN, MPIN_PATTERN, type User, type UserRole } from '../models/auth';

export type StaffRecord = {
  id: string;
  tenantId: string;
  mobileNumber: string;
  mpinHash: string;
  name: string;
  role: 'STAFF';
  isActive: boolean;
};

export type CreateStaffInput = {
  name: string;
  mobileNumber: string;
  mpin: string;
};

export type UpdateStaffInput = {
  id: string;
  name: string;
  mobileNumber: string;
  mpin?: string;
  isActive: boolean;
};

export interface StaffGateway {
  listStaff(tenantId: string): Promise<User[]>;
  getStaffRecord(tenantId: string, userId: string): Promise<StaffRecord | null>;
  findMobileOwner(tenantId: string, mobileNumber: string): Promise<{ id: string; role: UserRole } | null>;
  commitStaff(record: StaffRecord): Promise<'ok' | 'duplicate' | 'rejected'>;
  hashMpin(mpin: string): Promise<string>;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function assertName(name: string): string {
  const clean = normalizeName(name);
  if (!clean || clean.length > 80) {
    throw new StaffValidationError('Enter a staff name up to 80 characters.');
  }
  return clean;
}

function assertMobile(mobileNumber: string): string {
  const mobile = mobileNumber.trim();
  if (!MOBILE_PATTERN.test(mobile)) {
    throw new StaffValidationError('Mobile number must be 10 digits.');
  }
  return mobile;
}

function assertMpin(mpin: string): string {
  const pin = mpin.trim();
  if (!MPIN_PATTERN.test(pin)) {
    throw new StaffValidationError('MPIN must be 4 digits.');
  }
  return pin;
}

export class ManageStaffUseCase {
  constructor(
    private readonly actor: User,
    private readonly gateway: StaffGateway,
  ) {
    this.assertAdmin();
  }

  async list(): Promise<User[]> {
    this.assertAdmin();
    const staff = await this.gateway.listStaff(this.actor.tenantId);
    return staff.filter((user) => user.role === 'STAFF' && user.tenantId === this.actor.tenantId);
  }

  async create(input: CreateStaffInput): Promise<User> {
    this.assertAdmin();
    const name = assertName(input.name);
    const mobileNumber = assertMobile(input.mobileNumber);
    const mpin = assertMpin(input.mpin);
    await this.assertMobileAvailable(mobileNumber);

    const record: StaffRecord = {
      id: newId(),
      tenantId: this.actor.tenantId,
      mobileNumber,
      mpinHash: await this.gateway.hashMpin(mpin),
      name,
      role: 'STAFF',
      isActive: true,
    };

    await this.commit(record);
    return toUser(record);
  }

  async update(input: UpdateStaffInput): Promise<User> {
    this.assertAdmin();
    const existing = await this.ownedStaff(input.id);
    const name = assertName(input.name);
    const mobileNumber = assertMobile(input.mobileNumber);
    if (mobileNumber !== existing.mobileNumber) {
      await this.assertMobileAvailable(mobileNumber, existing.id);
    }

    const nextPin = input.mpin?.trim() ?? '';
    const mpinHash = nextPin ? await this.gateway.hashMpin(assertMpin(nextPin)) : existing.mpinHash;
    const record: StaffRecord = {
      ...existing,
      name,
      mobileNumber,
      mpinHash,
      isActive: input.isActive,
      role: 'STAFF',
      tenantId: this.actor.tenantId,
    };

    await this.commit(record);
    return toUser(record);
  }

  async setActive(userId: string, isActive: boolean): Promise<User> {
    this.assertAdmin();
    const existing = await this.ownedStaff(userId);
    const record: StaffRecord = { ...existing, isActive, tenantId: this.actor.tenantId, role: 'STAFF' };
    await this.commit(record);
    return toUser(record);
  }

  private assertAdmin(): void {
    if (this.actor.role !== 'ADMIN') {
      throw new StaffAccessError();
    }
  }

  private async ownedStaff(userId: string): Promise<StaffRecord> {
    const record = await this.gateway.getStaffRecord(this.actor.tenantId, userId);
    if (!record || record.tenantId !== this.actor.tenantId || record.role !== 'STAFF') {
      throw new StaffValidationError('Staff profile not found.');
    }
    return record;
  }

  private async assertMobileAvailable(mobileNumber: string, currentId?: string): Promise<void> {
    const owner = await this.gateway.findMobileOwner(this.actor.tenantId, mobileNumber);
    if (owner && owner.id !== currentId) {
      throw new StaffValidationError('This mobile number is already used in this business.');
    }
  }

  private async commit(record: StaffRecord): Promise<void> {
    const outcome = await this.gateway.commitStaff(record);
    if (outcome === 'duplicate') {
      throw new StaffValidationError('This mobile number is already used in this business.');
    }
    if (outcome === 'rejected') {
      throw new StaffValidationError('Staff profile not found.');
    }
  }
}

function toUser(record: StaffRecord): User {
  return {
    id: record.id,
    tenantId: record.tenantId,
    mobileNumber: record.mobileNumber,
    name: record.name,
    role: record.role,
    isActive: record.isActive,
  };
}

export function useManageStaff() {
  const { currentUser } = useAuth();
  const [staff, setStaff] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const forbidden = !currentUser || currentUser.role !== 'ADMIN';

  const refresh = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      setStaff([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { staffGateway } = await import('../../data/repositories/staffRepository');
      const useCase = new ManageStaffUseCase(currentUser, staffGateway);
      setStaff(await useCase.list());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load staff.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(
    async <T>(action: (useCase: ManageStaffUseCase) => Promise<T>): Promise<T> => {
      if (!currentUser || currentUser.role !== 'ADMIN') {
        throw new StaffAccessError();
      }
      const { staffGateway } = await import('../../data/repositories/staffRepository');
      const result = await action(new ManageStaffUseCase(currentUser, staffGateway));
      await refresh();
      return result;
    },
    [currentUser, refresh],
  );

  const createStaff = useCallback(
    (input: CreateStaffInput) => runMutation((useCase) => useCase.create(input)),
    [runMutation],
  );

  const updateStaff = useCallback(
    (input: UpdateStaffInput) => runMutation((useCase) => useCase.update(input)),
    [runMutation],
  );

  const setStaffActive = useCallback(
    (userId: string, isActive: boolean) => runMutation((useCase) => useCase.setActive(userId, isActive)),
    [runMutation],
  );

  return {
    staff,
    isLoading,
    error,
    forbidden,
    refresh,
    createStaff,
    updateStaff,
    setStaffActive,
  };
}
