import { cut, feed, image, text, type Node } from 'react-native-thermal-printer-driver';

import type { ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { THERMAL_PAPER_DOTS, THERMAL_QR_DOTS } from './thermalConstants';

export { THERMAL_PAPER_DOTS, THERMAL_QR_DOTS };

export function buildThermalReceiptNodes(
  receipt: ReceiptPayload,
  copy: ReceiptCopy,
  qrBase64: string,
): Node[] {
  const lines = receipt.text.replace(/₹/g, 'Rs').split('\n');
  const footer = lines.slice(-2);
  const body = lines.slice(0, -2);

  return [
    text(`${body.join('\n')}\n`),
    text(`${copy.scanPay.toLocaleUpperCase()}\n`, { align: 'center', bold: true }),
    image({ base64: stripDataUri(qrBase64), width: THERMAL_QR_DOTS }),
    text(`${footer.join('\n')}\n`, { align: 'center' }),
    feed(3),
    cut(),
  ];
}

export function buildThermalImageNodes(slipBase64: string): Node[] {
  return [image({ base64: stripDataUri(slipBase64), width: THERMAL_PAPER_DOTS }), feed(3), cut()];
}

export function buildThermalTestNodes(printerName: string): Node[] {
  return [
    text('LIQUEUR LOG\n', { align: 'center', bold: true, size: 2 }),
    text('Printer test\n', { align: 'center' }),
    text(`${printerName}\n`, { align: 'center' }),
    text('58mm thermal OK\n', { align: 'center' }),
    feed(3),
    cut(),
  ];
}

function stripDataUri(value: string): string {
  const marker = 'base64,';
  const index = value.indexOf(marker);
  if (index >= 0) {
    return value.slice(index + marker.length).replace(/\s+/g, '');
  }
  return value.replace(/\s+/g, '');
}
