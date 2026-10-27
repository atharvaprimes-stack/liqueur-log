import { cut, feed, image, text, type Node } from 'react-native-thermal-printer-driver';

import type { ReceiptPayload } from '../domain/billing';
import type { PrintPaperWidth } from './printPaperWidth';
import { THERMAL_PAPER_DOTS, THERMAL_QR_DOTS, thermalPaperDots } from './thermalConstants';

export { THERMAL_PAPER_DOTS, THERMAL_QR_DOTS };

export function buildThermalReceiptNodes(receipt: ReceiptPayload): Node[] {
  const lines = receipt.text.replace(/₹/g, 'Rs').split('\n');

  return [
    text(`${lines.join('\n')}\n`),
    feed(3),
    cut(),
  ];
}

export function buildThermalImageNodes(
  slipBase64: string,
  paper: PrintPaperWidth = 58,
): Node[] {
  return [
    image({ base64: stripDataUri(slipBase64), width: thermalPaperDots(paper) }),
    feed(3),
    cut(),
  ];
}

export function buildThermalTestNodes(
  printerName: string,
  paper: PrintPaperWidth = 58,
): Node[] {
  return [
    text('LIQUEUR LOG\n', { align: 'center', bold: true, size: 2 }),
    text('Printer test\n', { align: 'center' }),
    text(`${printerName}\n`, { align: 'center' }),
    text(`${paper}mm thermal OK\n`, { align: 'center' }),
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
