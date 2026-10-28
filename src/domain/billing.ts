import { OrderValidationError } from './errors';
import { parseRupeeToPaise } from './money';
import type { ServiceStation } from './models/inventory';
import { isPaymentMethod, type PaymentMethod } from './models/orders';

const SEQUENCE_PATTERN = /^(\d{4}-\d{2}-\d{2})-(\d+)$/;
const PLAIN_SEQUENCE_PATTERN = /^(\d+)$/;
/** Shared counter key — bill numbers do not reset each day. */
export const LIFETIME_SEQUENCE_KEY = 'all';
const WIDTH = 32;

export type ReceiptLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  station: ServiceStation;
};

export type ReceiptPayload = {
  sequence: string;
  heading: string;
  businessName: string;
  address: string;
  cashierName: string;
  closedAt: number;
  lines: ReceiptLine[];
  subtotal: number;
  taxAmount: number;
  roundOff: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentLabel: string;
  isCredit: boolean;
  text: string;
};

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatOrderSequence(value: number): string {
  return String(value);
}

/** Reads a continuous bill number, including legacy `YYYY-MM-DD-NN` strings. */
export function readSequenceNumber(sequence: string): number {
  const plain = PLAIN_SEQUENCE_PATTERN.exec(sequence.trim());
  if (plain) {
    const value = Number(plain[1]);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }
  const dated = SEQUENCE_PATTERN.exec(sequence.trim());
  if (!dated) {
    return 0;
  }
  const value = Number(dated[2]);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** @deprecated Prefer readSequenceNumber — kept for older dated sequence helpers. */
export function readSequenceTail(sequence: string, dateKey: string): number {
  const match = SEQUENCE_PATTERN.exec(sequence);
  if (!match || match[1] !== dateKey) {
    return readSequenceNumber(sequence);
  }
  const value = Number(match[2]);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function nextSequenceValue(trackerValue: number, billedTail: number): number {
  const tracker = Number.isInteger(trackerValue) && trackerValue > 0 ? trackerValue : 0;
  const billed = Number.isInteger(billedTail) && billedTail > 0 ? billedTail : 0;
  return Math.max(tracker, billed) + 1;
}

export function displayBillNumber(sequence: string): string {
  const value = readSequenceNumber(sequence);
  return value > 0 ? String(value) : sequence.trim();
}

export function formatBillStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export function sequenceSearchNeedle(query: string): string {
  return query.trim().replace(/[%_]/g, '');
}

export function resolvePayment(
  totalAmount: number,
  method: string | null,
  mode: 'full' | 'partial',
  paidInput: string,
): { method: PaymentMethod; paidAmount: number; isCredit: boolean } {
  if (!method || !isPaymentMethod(method)) {
    throw new OrderValidationError('payment');
  }

  const totalPaise = Math.round(totalAmount * 100);
  const paidPaise = mode === 'full' ? totalPaise : parseRupeeToPaise(paidInput);
  if (paidPaise === null || paidPaise < 0 || paidPaise > totalPaise) {
    throw new OrderValidationError('amount');
  }

  return {
    method,
    paidAmount: paidPaise / 100,
    isCredit: paidPaise < totalPaise,
  };
}

export function previewBalance(totalAmount: number, mode: 'full' | 'partial', paidInput: string): number | null {
  const totalPaise = Math.round(totalAmount * 100);
  if (mode === 'full') {
    return 0;
  }
  const paidPaise = parseRupeeToPaise(paidInput);
  if (paidPaise === null || paidPaise > totalPaise) {
    return null;
  }
  return (totalPaise - paidPaise) / 100;
}

export function lineTotalPaise(quantity: number, unitPrice: number): number {
  return quantity * Math.round(unitPrice * 100);
}

/** Collapse same-item serves into one receipt row (qty summed). */
export function aggregateReceiptLines(lines: readonly ReceiptLine[]): ReceiptLine[] {
  const grouped = new Map<string, ReceiptLine>();
  for (const line of lines) {
    const key = `${line.station}\u0000${line.label}\u0000${Math.round(line.unitPrice * 100)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.lineTotal = lineTotalPaise(existing.quantity, existing.unitPrice) / 100;
    } else {
      grouped.set(key, {
        label: line.label,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        station: line.station,
      });
    }
  }
  return [...grouped.values()];
}

/** Bar lines first, then kitchen — keeps bill sections stable for print and UI. */
export function groupReceiptLinesByStation(lines: readonly ReceiptLine[]): {
  bar: ReceiptLine[];
  kitchen: ReceiptLine[];
} {
  const bar: ReceiptLine[] = [];
  const kitchen: ReceiptLine[] = [];
  for (const line of lines) {
    if (line.station === 'kitchen') {
      kitchen.push(line);
    } else {
      bar.push(line);
    }
  }
  return { bar, kitchen };
}

export function formatReceiptAmount(amount: number): string {
  const paise = Math.round(amount * 100);
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}₹${whole}.${fraction}`;
}

export function formatReceiptMath(quantity: number, unitPrice: number, pcs: string): string {
  return `${quantity} ${pcs} x ${formatReceiptAmount(unitPrice)}`;
}

export function receiptItemLabel(
  name: string,
  liquorType: string,
  volumeMl: number,
  station?: ServiceStation,
): string {
  const title = name.trim().replace(/\s+/g, ' ');
  const kitchen = station === 'kitchen' || liquorType === 'Snacks';
  const size = kitchen ? `${volumeMl}g` : `${volumeMl}ml`;
  return title ? `${title} ${size}` : size;
}

export function receiptTotals(
  lines: readonly ReceiptLine[],
  totalAmount: number,
): { subtotal: number; taxAmount: number; roundOff: number } {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.quantity * Math.round(line.unitPrice * 100), 0);
  const totalPaise = Math.round(totalAmount * 100);
  return {
    subtotal: subtotalPaise / 100,
    taxAmount: 0,
    roundOff: (totalPaise - subtotalPaise) / 100,
  };
}

export function buildReceipt(input: {
  businessName: string;
  address?: string;
  sequence: string;
  heading: string;
  cashierName: string;
  closedAt: number;
  lines: ReceiptLine[];
  totalAmount: number;
  paidAmount: number;
  paymentLabel: string;
  isCredit: boolean;
  labels: {
    billNo: string;
    cashier: string;
    subtotal: string;
    roundOff: string;
    total: string;
    credit: string;
    thanks: string;
    poweredBy: string;
    pcs: string;
    bar: string;
    kitchen: string;
  };
}): ReceiptPayload {
  const balancePaise = Math.max(Math.round(input.totalAmount * 100) - Math.round(input.paidAmount * 100), 0);
  const balanceAmount = balancePaise / 100;
  const totals = receiptTotals(input.lines, input.totalAmount);
  const dash = '-'.repeat(WIDTH);
  const equals = '='.repeat(WIDTH);
  const stamp = formatBillStamp(input.closedAt);
  const place = input.heading.trim();
  const cashier = input.cashierName.trim();
  const address = (input.address ?? '').trim().replace(/\s+/g, ' ');
  const sections = groupReceiptLinesByStation(input.lines);
  const rows = [center(input.businessName.toLocaleUpperCase())];
  if (address) {
    rows.push(center(address));
  }
  rows.push(
    equals,
    metaRow(input.labels.billNo, stamp, 'left', 'right'),
    metaRow(place, cashier, 'left', 'right'),
    dash,
  );

  const appendSection = (title: string, lines: ReceiptLine[]) => {
    if (lines.length === 0) {
      return;
    }
    rows.push(center(`· ${title.toLocaleUpperCase()} ·`));
    for (const line of lines) {
      rows.push(...wrapText(line.label));
      rows.push(
        pair(formatReceiptMath(line.quantity, line.unitPrice, input.labels.pcs), formatReceiptAmount(line.lineTotal)),
      );
    }
  };
  appendSection(input.labels.bar, sections.bar);
  appendSection(input.labels.kitchen, sections.kitchen);

  rows.push(equals, pair(input.labels.total, formatReceiptAmount(input.totalAmount)));
  if (input.isCredit) {
    rows.push(pair(input.paymentLabel, formatReceiptAmount(input.paidAmount)), pair(input.labels.credit, formatReceiptAmount(balanceAmount)));
  } else {
    rows.push(center(input.paymentLabel));
  }
  rows.push(dash, center(input.labels.thanks), center(input.labels.poweredBy));

  return {
    sequence: input.sequence,
    heading: input.heading,
    businessName: input.businessName,
    address,
    cashierName: input.cashierName.trim(),
    closedAt: input.closedAt,
    lines: input.lines,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    roundOff: totals.roundOff,
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    balanceAmount,
    paymentLabel: input.paymentLabel,
    isCredit: input.isCredit,
    text: rows.join('\n'),
  };
}

function center(value: string): string {
  const text = clip(value.trim() || '-');
  const pad = Math.max(Math.floor((WIDTH - text.length) / 2), 0);
  return `${' '.repeat(pad)}${text}`;
}

function pair(left: string, right: string): string {
  const rightText = clip(right);
  const room = WIDTH - rightText.length - 1;
  const leftText = room > 0 ? clip(left, room) : '';
  const gap = Math.max(WIDTH - leftText.length - rightText.length, 1);
  return `${leftText}${' '.repeat(gap)}${rightText}`;
}

function metaRow(
  left: string,
  right: string,
  leftAlign: 'left' | 'right',
  rightAlign: 'left' | 'right',
): string {
  const half = Math.floor(WIDTH / 2);
  return `${alignCell(left, half, leftAlign)}${alignCell(right, WIDTH - half, rightAlign)}`;
}

function alignCell(value: string, width: number, align: 'left' | 'right'): string {
  const text = clip(value.trim(), width);
  const pad = Math.max(width - [...text].length, 0);
  if (align === 'right') {
    return `${' '.repeat(pad)}${text}`;
  }
  return `${text}${' '.repeat(pad)}`;
}

function wrapText(value: string, width = WIDTH): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    const characters = [...word];
    if (characters.length <= width) {
      current = word;
      continue;
    }
    for (let index = 0; index < characters.length; index += width) {
      const chunk = characters.slice(index, index + width).join('');
      if (index + width >= characters.length) {
        current = chunk;
      } else {
        lines.push(chunk);
      }
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function clip(value: string, width = WIDTH): string {
  const characters = [...value];
  if (characters.length <= width) {
    return value;
  }
  if (width <= 3) {
    return characters.slice(0, width).join('');
  }
  return `${characters.slice(0, width - 3).join('')}...`;
}
