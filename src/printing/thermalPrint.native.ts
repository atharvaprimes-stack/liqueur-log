import { Platform } from 'react-native';
import ThermalPrinter, { type Device, type Node } from 'react-native-thermal-printer-driver';

import type { ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { captureReceiptPng } from './receiptCapture';
import { getRegisteredPrinter, type RegisteredPrinter } from './printerStore';
import { loadReceiptQrBase64 } from './receiptQrBase64';
import {
  buildThermalImageNodes,
  buildThermalReceiptNodes,
  buildThermalTestNodes,
} from './thermalNodes';

export type ThermalDevice = Device;

const PRINT_OPTIONS = {
  paperWidthMm: 58 as const,
  keepAlive: true,
  timeout: 45_000,
};

export function isThermalPrinterSupported(): boolean {
  return Platform.OS === 'android';
}

export async function hasThermalPrinter(): Promise<boolean> {
  if (!isThermalPrinterSupported()) {
    return false;
  }
  return (await getRegisteredPrinter()) !== null;
}

export async function scanThermalPrinters(): Promise<{ paired: ThermalDevice[]; found: ThermalDevice[] }> {
  ensureAndroid();
  return ThermalPrinter.scan();
}

export async function stopThermalPrinterScan(): Promise<void> {
  if (!isThermalPrinterSupported()) {
    return;
  }
  await ThermalPrinter.stopScan();
}

export async function testThermalPrinter(printer: RegisteredPrinter): Promise<void> {
  ensureAndroid();
  await printNodes(printer.address, buildThermalTestNodes(printer.name));
}

export async function printThermalReceipt(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<boolean> {
  if (!isThermalPrinterSupported()) {
    return false;
  }
  const printer = await getRegisteredPrinter();
  if (!printer) {
    return false;
  }

  let nodes: Node[];
  try {
    const slip = await captureReceiptPng(receipt, copy);
    nodes = buildThermalImageNodes(slip);
  } catch {
    const qr = await loadReceiptQrBase64();
    nodes = buildThermalReceiptNodes(receipt, copy, qr);
  }

  await printNodes(printer.address, nodes);
  return true;
}

async function printNodes(address: string, nodes: Node[]): Promise<void> {
  const target = normalizeAddress(address);
  try {
    await ThermalPrinter.print(target, nodes, PRINT_OPTIONS);
  } catch {
    // Reconnect once — portable printers often drop the SPP socket between jobs.
    await ThermalPrinter.connect(target, { timeout: 12_000 });
    await ThermalPrinter.print(target, nodes, PRINT_OPTIONS);
  }
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (/^(bt|ble|tcp):/i.test(trimmed)) {
    return trimmed;
  }
  // Paired Classic MAC from system settings / older saves.
  if (/^[0-9A-Fa-f:.-]{11,}$/.test(trimmed)) {
    return `bt:${trimmed.replace(/-/g, ':').toUpperCase()}`;
  }
  return trimmed;
}

function ensureAndroid(): void {
  if (!isThermalPrinterSupported()) {
    throw new Error('thermal-unsupported');
  }
}
