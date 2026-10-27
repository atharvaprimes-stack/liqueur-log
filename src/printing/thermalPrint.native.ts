import { Platform } from 'react-native';
import ThermalPrinter, { type Device, type Node } from 'react-native-thermal-printer-driver';

import type { ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { ensureBluetoothPermissions } from './bluetoothPermissions';
import { getPrintPaperWidth, type PrintPaperWidth } from './printPaperWidth';
import { captureReceiptPng } from './receiptCapture';
import { getRegisteredPrinter, type RegisteredPrinter } from './printerStore';
import { ThermalPrintError } from './thermalErrors';
import {
  buildThermalImageNodes,
  buildThermalReceiptNodes,
  buildThermalTestNodes,
} from './thermalNodes';

export type ThermalDevice = Device;

const PRINT_BASE = {
  keepAlive: true,
  timeout: 45_000,
} as const;

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
  await requireBluetoothPermissions();
  try {
    const result = await ThermalPrinter.scan();
    return {
      paired: result.paired.map(normalizeDevice),
      found: result.found.map(normalizeDevice),
    };
  } catch (error) {
    throw mapScanError(error);
  }
}

export async function stopThermalPrinterScan(): Promise<void> {
  if (!isThermalPrinterSupported()) {
    return;
  }
  await ThermalPrinter.stopScan();
}

export async function testThermalPrinter(printer: RegisteredPrinter): Promise<void> {
  ensureAndroid();
  await requireBluetoothPermissions();
  const paper = await getPrintPaperWidth();
  try {
    await printNodes(printer.address, buildThermalTestNodes(printer.name, paper), paper);
  } catch (error) {
    throw mapPrintError(error);
  }
}

export async function printThermalReceipt(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<boolean> {
  if (!isThermalPrinterSupported()) {
    return false;
  }
  const printer = await getRegisteredPrinter();
  if (!printer) {
    return false;
  }

  await requireBluetoothPermissions();
  const paper = await getPrintPaperWidth();

  let nodes: Node[];
  try {
    const slip = await captureReceiptPng(receipt, copy);
    nodes = buildThermalImageNodes(slip, paper);
  } catch {
    nodes = buildThermalReceiptNodes(receipt);
  }

  try {
    await printNodes(printer.address, nodes, paper);
  } catch (error) {
    throw mapPrintError(error);
  }
  return true;
}

async function printNodes(address: string, nodes: Node[], paper: PrintPaperWidth): Promise<void> {
  const target = normalizeAddress(address);
  const options = { ...PRINT_BASE, paperWidthMm: paper };
  try {
    await ThermalPrinter.print(target, nodes, options);
  } catch {
    // Reconnect once — portable printers often drop the SPP socket between jobs.
    await ThermalPrinter.connect(target, { timeout: 12_000 });
    await ThermalPrinter.print(target, nodes, options);
  }
}

async function requireBluetoothPermissions(): Promise<void> {
  const result = await ensureBluetoothPermissions();
  if (result === 'denied') {
    throw new ThermalPrintError('permission');
  }
  if (result === 'unavailable') {
    throw new ThermalPrintError('unsupported');
  }
}

function normalizeDevice(device: Device): ThermalDevice {
  return {
    ...device,
    address: normalizeAddress(device.address, device.deviceType),
  };
}

function normalizeAddress(address: string, deviceType?: Device['deviceType']): string {
  const trimmed = address.trim();
  if (/^(bt|ble|tcp):/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9A-Fa-f:.-]{11,}$/.test(trimmed)) {
    const mac = trimmed.replace(/-/g, ':').toUpperCase();
    if (deviceType === 'ble') {
      return `ble:${mac}`;
    }
    // Classic / dual / unknown paired MACs → SPP.
    return `bt:${mac}`;
  }
  return trimmed;
}

function mapScanError(error: unknown): ThermalPrintError {
  if (error instanceof ThermalPrintError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
  const blob = `${code} ${message}`.toLowerCase();
  if (blob.includes('permission') || blob.includes('bt_permission')) {
    return new ThermalPrintError('permission', message);
  }
  if (blob.includes('bt_disabled') || blob.includes('disabled')) {
    return new ThermalPrintError('bluetooth-off', message);
  }
  return new ThermalPrintError('scan-failed', message);
}

function mapPrintError(error: unknown): ThermalPrintError {
  if (error instanceof ThermalPrintError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const blob = message.toLowerCase();
  if (blob.includes('permission')) {
    return new ThermalPrintError('permission', message);
  }
  return new ThermalPrintError('print-failed', message);
}

function ensureAndroid(): void {
  if (!isThermalPrinterSupported()) {
    throw new ThermalPrintError('unsupported');
  }
}
