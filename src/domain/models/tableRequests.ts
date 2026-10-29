export const TABLE_REQUEST_STATUSES = ['pending', 'accepted', 'rejected', 'closed'] as const;

export type TableRequestStatus = (typeof TABLE_REQUEST_STATUSES)[number];

export type TableRequest = {
  id: string;
  tenantId: string;
  tableId: string;
  itemId: string;
  nameEn: string;
  nameMr: string;
  quantity: number;
  unitPrice: number;
  status: TableRequestStatus;
  createdAt: number;
  updatedAt: number;
};

export type TableRequestSummary = {
  tableId: string;
  count: number;
  totalAmount: number;
  requests: TableRequest[];
};

export function isTableRequestStatus(value: string): value is TableRequestStatus {
  return TABLE_REQUEST_STATUSES.some((status) => status === value);
}

export function requestLineTotal(request: Pick<TableRequest, 'quantity' | 'unitPrice'>): number {
  return Math.round(request.quantity * request.unitPrice * 100) / 100;
}

export function pendingRequestsForTable(requests: TableRequest[], tableId: string): TableRequest[] {
  const normalized = normalizeTableId(tableId);
  return requests.filter(
    (request) => request.status === 'pending' && normalizeTableId(request.tableId) === normalized,
  );
}

export function summarizePendingByTable(requests: TableRequest[]): Map<string, TableRequestSummary> {
  const byTable = new Map<string, TableRequestSummary>();
  for (const request of requests) {
    if (request.status !== 'pending') {
      continue;
    }
    const tableId = normalizeTableId(request.tableId);
    const existing = byTable.get(tableId);
    if (existing) {
      existing.count += 1;
      existing.totalAmount = Math.round((existing.totalAmount + requestLineTotal(request)) * 100) / 100;
      existing.requests.push(request);
      continue;
    }
    byTable.set(tableId, {
      tableId,
      count: 1,
      totalAmount: requestLineTotal(request),
      requests: [request],
    });
  }
  return byTable;
}

export function normalizeTableId(tableId: string): string {
  if (!/^\d{1,3}$/.test(tableId)) {
    return tableId;
  }
  return String(Number(tableId));
}
