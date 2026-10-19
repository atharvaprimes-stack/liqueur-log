export type SyncChange = {
  queue_id: string;
  entity: string;
  entity_id: string;
  operation: 'upsert' | 'delete';
  record: Record<string, unknown>;
};

export type SyncSnapshot = {
  tenant?: Record<string, unknown> | null;
  users?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  item_types?: Record<string, unknown>[];
  item_strengths?: Record<string, unknown>[];
  vendors?: Record<string, unknown>[];
  purchases?: Record<string, unknown>[];
  orders?: Record<string, unknown>[];
  sequences?: Record<string, unknown>[];
  movements?: Record<string, unknown>[];
  activity?: Record<string, unknown>[];
  tombstones?: Record<string, unknown>[];
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

export function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

export function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

export function booleanField(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === true || value === 1 || value === '1' || value === 'true';
}
