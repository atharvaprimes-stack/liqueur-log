import type { ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import type { RegisteredPrinter } from './printerStore';

export type ThermalDevice = {
  name: string;
  address: string;
  deviceType: 'bt' | 'ble' | 'dual' | 'unknown';
  rssi?: number;
};

export function isThermalPrinterSupported(): boolean {
  return false;
}

export async function hasThermalPrinter(): Promise<boolean> {
  return false;
}

export async function scanThermalPrinters(): Promise<{ paired: ThermalDevice[]; found: ThermalDevice[] }> {
  return { paired: [], found: [] };
}

export async function stopThermalPrinterScan(): Promise<void> {}

export async function testThermalPrinter(_printer: RegisteredPrinter): Promise<void> {
  throw new Error('thermal-unsupported');
}

export async function printThermalReceipt(
  _receipt: ReceiptPayload,
  _copy: ReceiptCopy,
): Promise<boolean> {
  return false;
}
