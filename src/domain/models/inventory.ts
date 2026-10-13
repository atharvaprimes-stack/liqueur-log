import { InventoryValidationError } from '../errors';
import { parseQuantity, parseRupeeToPaise } from '../money';

export const LIQUOR_TYPES = ['IMFL', 'Beer', 'Wine', 'Foreign', 'Country', 'Snacks'] as const;
export const SUB_TYPES = ['Strong', 'Mild'] as const;
export const PAYMENT_TYPES = ['Cash', 'UPI', 'Credit'] as const;

export type LiquorType = (typeof LIQUOR_TYPES)[number];
export type SubType = (typeof SUB_TYPES)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export type StockItem = {
  id: string;
  tenantId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  brand: string;
  liquorType: LiquorType;
  subType: SubType;
  volumeMl: number;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  lowStockThreshold: number;
};

export type DraftLine = {
  itemId: string;
  quantity: string;
  unitPrice: string;
};

export type PurchaseFormInput = {
  supplierName: string;
  invoiceNumber: string;
  paymentType: string;
  lines: DraftLine[];
};

export type PurchaseLineRecord = {
  itemId: string;
  quantityReceived: number;
  unitPurchasePaise: number;
};

export type PurchaseDraft = {
  supplierName: string;
  invoiceNumber: string;
  paymentType: PaymentType;
  lines: PurchaseLineRecord[];
  totalPaise: number;
  paidPaise: number;
};

export type StockSection = {
  liquorType: LiquorType;
  data: StockItem[];
};

export type StockFacet = 'all' | 'low' | LiquorType;

const LARGE_STOCK_CHANGE = 10;

const VOLUME_KEYS: Record<number, string> = {
  180: 'stock.volume.nip',
  330: 'stock.volume.pint',
  375: 'stock.volume.half',
  650: 'stock.volume.bottle',
  750: 'stock.volume.quart',
};

export function isLiquorType(value: string): value is LiquorType {
  return LIQUOR_TYPES.some((type) => type === value);
}

export function isSubType(value: string): value is SubType {
  return SUB_TYPES.some((type) => type === value);
}

export function isPaymentType(value: string): value is PaymentType {
  return PAYMENT_TYPES.some((type) => type === value);
}

export function itemNames(item: Pick<StockItem, 'nameEn' | 'nameMr'>, language: string): {
  primary: string;
  secondary: string;
} {
  if (language.startsWith('mr')) {
    return { primary: item.nameMr, secondary: item.nameEn };
  }
  return { primary: item.nameEn, secondary: item.nameMr };
}

export function volumeMessage(item: Pick<StockItem, 'volumeMl' | 'liquorType'>): {
  key: string;
  values: { ml?: number; amount?: number };
} {
  if (item.liquorType === 'Snacks') {
    return { key: 'stock.volume.pack', values: { amount: item.volumeMl } };
  }

  return {
    key: VOLUME_KEYS[item.volumeMl] ?? 'stock.volume.ml',
    values: { ml: item.volumeMl },
  };
}

export function compactVolume(item: Pick<StockItem, 'volumeMl' | 'liquorType'>): {
  key: string;
  values: { ml?: number; amount?: number };
} {
  if (item.liquorType === 'Snacks') {
    return { key: 'stock.volume.pack', values: { amount: item.volumeMl } };
  }
  return { key: 'stock.volume.ml', values: { ml: item.volumeMl } };
}

export function isLowStock(item: Pick<StockItem, 'currentStock' | 'lowStockThreshold'>): boolean {
  return item.currentStock <= item.lowStockThreshold;
}

export function parseStockCount(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,4}$/.test(trimmed)) {
    return null;
  }

  const count = Number(trimmed);
  if (!Number.isInteger(count) || count > 9999) {
    return null;
  }
  return count;
}

export function stockChangeNeedsConfirm(currentStock: number, nextStock: number): 'zero' | 'large' | null {
  if (nextStock === currentStock) {
    return null;
  }
  if (nextStock === 0) {
    return 'zero';
  }
  if (Math.abs(nextStock - currentStock) >= LARGE_STOCK_CHANGE) {
    return 'large';
  }
  return null;
}

export function stockFacetCounts(items: StockItem[]): {
  all: number;
  low: number;
  types: Record<LiquorType, number>;
} {
  const types: Record<LiquorType, number> = {
    IMFL: 0,
    Beer: 0,
    Wine: 0,
    Foreign: 0,
    Country: 0,
    Snacks: 0,
  };
  let low = 0;
  for (const item of items) {
    types[item.liquorType] += 1;
    if (isLowStock(item)) {
      low += 1;
    }
  }
  return { all: items.length, low, types };
}

export function applyStockFacet(items: StockItem[], facet: StockFacet): StockItem[] {
  if (facet === 'all') {
    return items;
  }
  if (facet === 'low') {
    return items.filter(isLowStock);
  }
  return items.filter((item) => item.liquorType === facet);
}

export function filterStock(items: StockItem[], query: string): StockItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  return items.filter((item) =>
    [item.itemCode, item.nameEn, item.nameMr, item.brand, item.liquorType, String(item.volumeMl)].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}

export function groupStock(items: StockItem[]): StockSection[] {
  return LIQUOR_TYPES.flatMap((liquorType) => {
    const data = items
      .filter((item) => item.liquorType === liquorType)
      .sort(
        (left, right) =>
          left.brand.localeCompare(right.brand, undefined, { sensitivity: 'base' }) ||
          left.volumeMl - right.volumeMl ||
          left.nameEn.localeCompare(right.nameEn, undefined, { sensitivity: 'base' }) ||
          left.itemCode.localeCompare(right.itemCode),
      );
    return data.length > 0 ? [{ liquorType, data }] : [];
  });
}

export function summarizeDraft(lines: DraftLine[]): {
  totalPaise: number;
  lineCount: number;
  complete: boolean;
  issue: 'quantity' | 'price' | null;
} {
  let totalPaise = 0;
  let lineCount = 0;
  let invalidQuantity = false;
  let invalidPrice = false;

  for (const line of lines) {
    const quantityState = classifyQuantity(line.quantity);
    if (quantityState === 'empty') {
      continue;
    }
    const paise = parseRupeeToPaise(line.unitPrice);
    if (quantityState === 'invalid') {
      invalidQuantity = true;
      continue;
    }
    if (paise === null) {
      invalidPrice = true;
      continue;
    }
    lineCount += 1;
    totalPaise += quantityState * paise;
  }

  let issue: 'quantity' | 'price' | null = null;
  if (invalidQuantity) {
    issue = 'quantity';
  } else if (invalidPrice) {
    issue = 'price';
  }

  return {
    totalPaise,
    lineCount,
    complete: lineCount > 0 && issue === null && Number.isSafeInteger(totalPaise),
    issue,
  };
}

export function buildPurchaseRecord(input: PurchaseFormInput): PurchaseDraft {
  const supplierName = normalizeWords(input.supplierName, 80, 'supplier');
  const invoiceNumber = normalizeWords(input.invoiceNumber, 40, 'invoice');
  if (!isPaymentType(input.paymentType)) {
    throw new InventoryValidationError('payment');
  }

  const lines: PurchaseLineRecord[] = [];
  let totalPaise = 0;
  let invalidQuantity = false;
  let invalidPrice = false;

  for (const line of input.lines) {
    const quantityState = classifyQuantity(line.quantity);
    if (quantityState === 'empty') {
      continue;
    }
    if (quantityState === 'invalid') {
      invalidQuantity = true;
      continue;
    }

    const unitPurchasePaise = parseRupeeToPaise(line.unitPrice);
    if (unitPurchasePaise === null) {
      invalidPrice = true;
      continue;
    }

    lines.push({
      itemId: line.itemId,
      quantityReceived: quantityState,
      unitPurchasePaise,
    });
    totalPaise += quantityState * unitPurchasePaise;
  }

  if (invalidQuantity) {
    throw new InventoryValidationError('quantity');
  }
  if (invalidPrice) {
    throw new InventoryValidationError('price');
  }
  if (lines.length === 0 || new Set(lines.map((line) => line.itemId)).size !== lines.length) {
    throw new InventoryValidationError('lines');
  }
  if (!Number.isSafeInteger(totalPaise)) {
    throw new InventoryValidationError('price');
  }

  return {
    supplierName,
    invoiceNumber,
    paymentType: input.paymentType,
    lines,
    totalPaise,
    paidPaise: input.paymentType === 'Credit' ? 0 : totalPaise,
  };
}

function normalizeWords(value: string, maxLength: number, code: 'supplier' | 'invoice'): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > maxLength) {
    throw new InventoryValidationError(code);
  }
  return clean;
}

function classifyQuantity(input: string): 'empty' | 'invalid' | number {
  const trimmed = input.trim();
  if (!trimmed || /^0+$/.test(trimmed)) {
    return 'empty';
  }
  return parseQuantity(trimmed) ?? 'invalid';
}
