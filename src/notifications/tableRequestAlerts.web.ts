import type { TableRequest } from '../domain/models/tableRequests';

/** Web has no OS push/local notification support for this flow. */
export async function configureTableRequestNotifications(): Promise<void> {}

export async function registerTableRequestPushToken(_tenantId: string): Promise<void> {}

export async function notifyIncomingTableRequest(_request: TableRequest): Promise<void> {}
