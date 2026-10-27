export type ThermalErrorCode =
  | 'permission'
  | 'bluetooth-off'
  | 'scan-empty'
  | 'scan-failed'
  | 'print-failed'
  | 'unsupported';

export class ThermalPrintError extends Error {
  readonly code: ThermalErrorCode;

  constructor(code: ThermalErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ThermalPrintError';
    this.code = code;
  }
}

export function thermalErrorCode(error: unknown): ThermalErrorCode {
  if (error instanceof ThermalPrintError) {
    return error.code;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('permission') || lower.includes('bt_permission')) {
    return 'permission';
  }
  if (lower.includes('bt_disabled') || lower.includes('bluetooth is disabled')) {
    return 'bluetooth-off';
  }
  if (lower.includes('thermal-unsupported') || lower.includes('not supported')) {
    return 'unsupported';
  }
  return 'scan-failed';
}
