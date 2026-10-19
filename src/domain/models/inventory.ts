import { InventoryValidationError } from '../errors';
import { parseQuantity, parseRupeeToPaise } from '../money';

export const DEFAULT_ITEM_TYPES = ['IMFL', 'Beer', 'Wine', 'Foreign', 'Country', 'Snacks'] as const;
export const DEFAULT_ITEM_STRENGTHS = ['Strong', 'Mild'] as const;
export const PAYMENT_TYPES = ['Cash', 'Partial', 'Credit'] as const;
export const STOCK_PICKER_CATEGORIES = ['all', 'liquor', 'beer', 'kitchen'] as const;
export const SERVICE_STATIONS = ['bar', 'kitchen'] as const;

export type LiquorType = string;
export type SubType = string;
export type ServiceStation = (typeof SERVICE_STATIONS)[number];

export type CatalogTerm = {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
};
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type StockPickerCategory = (typeof STOCK_PICKER_CATEGORIES)[number];

export type StockItem = {
  id: string;
  tenantId: string;
  serialNo: number;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  brand: string;
  liquorType: LiquorType;
  subType: SubType;
  serviceStation: ServiceStation;
  volumeMl: number;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  lowStockThreshold: number;
};

export type CatalogItemInput = {
  itemCode: string;
  nameEn: string;
  nameMr: string;
  brand: string;
  liquorType: string;
  subType: string;
  serviceStation: ServiceStation;
  volumeMl: string;
  purchasePrice: string;
  sellingPrice: string;
  lowStockThreshold: string;
};

export type CatalogItemDraft = {
  itemCode: string;
  nameEn: string;
  nameMr: string;
  brand: string;
  liquorType: LiquorType;
  subType: SubType;
  serviceStation: ServiceStation;
  volumeMl: number;
  purchasePrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
};

export type Vendor = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
};

export type VendorInput = {
  name: string;
  phone: string;
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
  /** Cash amount paid now; required when paymentType is Partial. */
  amountPaid?: string;
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

export function knownTermLabel(kind: 'types' | 'subTypes', name: string, t: (key: string) => string): string {
  const key = `stock.${kind}.${name}`;
  const label = t(key);
  return label === key ? name : label;
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

export function isServiceStation(value: string): value is ServiceStation {
  return SERVICE_STATIONS.some((station) => station === value);
}

export function defaultServiceStation(liquorType: string): ServiceStation {
  return liquorType.trim().toLowerCase() === 'snacks' ? 'kitchen' : 'bar';
}

export function resolveServiceStation(
  value: string | null | undefined,
  liquorType?: string,
): ServiceStation {
  if (value && isServiceStation(value)) {
    return value;
  }
  return defaultServiceStation(liquorType ?? '');
}

export function volumeMessage(
  item: Pick<StockItem, 'volumeMl' | 'liquorType' | 'serviceStation'> | {
    volumeMl: number;
    liquorType: string;
    serviceStation?: string;
  },
): {
  key: string;
  values: { ml?: number; amount?: number };
} {
  if (isKitchenItem(item)) {
    return { key: 'stock.volume.pack', values: { amount: item.volumeMl } };
  }

  return {
    key: VOLUME_KEYS[item.volumeMl] ?? 'stock.volume.ml',
    values: { ml: item.volumeMl },
  };
}

export function compactVolume(
  item: Pick<StockItem, 'volumeMl' | 'liquorType' | 'serviceStation'> | {
    volumeMl: number;
    liquorType: string;
    serviceStation?: string;
  },
): {
  key: string;
  values: { ml?: number; amount?: number };
} {
  if (isKitchenItem(item)) {
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
  types: Record<string, number>;
} {
  const types: Record<string, number> = {};
  let low = 0;
  for (const item of items) {
    types[item.liquorType] = (types[item.liquorType] ?? 0) + 1;
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

export function isKitchenItem(item: { serviceStation?: string; liquorType?: string }): boolean {
  return resolveServiceStation(item.serviceStation, item.liquorType) === 'kitchen';
}

export type OrderCatalogSection = ServiceStation;

export const TOP_SELLERS_LIMIT = 8;

export function filterOrderSection(items: StockItem[], section: OrderCatalogSection): StockItem[] {
  return items.filter((item) => (section === 'kitchen' ? isKitchenItem(item) : !isKitchenItem(item)));
}

/** Search matches serial number, item code, or display names (not brand/type). */
export function filterOrderSearch(items: StockItem[], query: string): StockItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  return items.filter((item) => matchesItemSearch(item, needle));
}

export function filterOrderCatalog(
  items: StockItem[],
  section: OrderCatalogSection,
  query: string,
): StockItem[] {
  return filterOrderSearch(filterOrderSection(items, section), query);
}

/** Cap to a small grid of frequent sellers for the selected tab; never the full catalog. */
export function pickTopSellers(
  sectionItems: StockItem[],
  frequentIds: readonly string[],
  limit: number = TOP_SELLERS_LIMIT,
): StockItem[] {
  if (limit <= 0 || sectionItems.length === 0) {
    return [];
  }

  const remaining = new Map(sectionItems.map((item) => [item.id, item]));
  const picked: StockItem[] = [];

  for (const id of frequentIds) {
    const item = remaining.get(id);
    if (!item) {
      continue;
    }
    picked.push(item);
    remaining.delete(id);
    if (picked.length >= limit) {
      return picked;
    }
  }

  const leftovers = [...remaining.values()].sort((left, right) => {
    const stockDelta = Number(right.currentStock > 0) - Number(left.currentStock > 0);
    if (stockDelta !== 0) {
      return stockDelta;
    }
    return left.itemCode.localeCompare(right.itemCode);
  });

  for (const item of leftovers) {
    picked.push(item);
    if (picked.length >= limit) {
      break;
    }
  }

  return picked;
}

export function filterStock(items: StockItem[], query: string): StockItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  return items.filter(
    (item) =>
      matchesItemSearch(item, needle) ||
      [item.brand, item.liquorType, String(item.volumeMl)].some((value) => value.toLowerCase().includes(needle)),
  );
}

/** Fast stock-entry search: serial number, item code, or display names. */
export function filterStockEntrySearch(items: StockItem[], query: string): StockItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  return items.filter((item) => matchesItemSearch(item, needle));
}

export function matchesItemSearch(item: StockItem, needle: string): boolean {
  return [String(item.serialNo), item.itemCode, item.nameEn, item.nameMr].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export function filterStockPickerCategory(items: StockItem[], category: StockPickerCategory): StockItem[] {
  if (category === 'all') {
    return items;
  }
  if (category === 'beer') {
    return items.filter((item) => item.liquorType === 'Beer');
  }
  if (category === 'kitchen') {
    return items.filter(isKitchenItem);
  }
  return items.filter((item) => item.liquorType !== 'Beer' && !isKitchenItem(item));
}

export function groupStock(items: StockItem[], typeOrder: readonly string[] = DEFAULT_ITEM_TYPES): StockSection[] {
  const names = [...typeOrder];
  for (const item of items) {
    if (!names.includes(item.liquorType)) {
      names.push(item.liquorType);
    }
  }
  return names.flatMap((liquorType) => {
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

  let paidPaise = totalPaise;
  if (input.paymentType === 'Credit') {
    paidPaise = 0;
  } else if (input.paymentType === 'Partial') {
    const parsed = parseRupeeToPaise(input.amountPaid ?? '');
    if (parsed === null || parsed <= 0 || parsed >= totalPaise) {
      throw new InventoryValidationError('amount-paid');
    }
    paidPaise = parsed;
  }

  return {
    supplierName,
    invoiceNumber,
    paymentType: input.paymentType,
    lines,
    totalPaise,
    paidPaise,
  };
}

export function parseCatalogItem(input: CatalogItemInput): CatalogItemDraft {
  const itemCode = input.itemCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{2,12}$/.test(itemCode)) {
    throw new InventoryValidationError('item-code');
  }

  const nameEn = cleanLabel(input.nameEn, 'name');
  const nameMr = cleanLabel(input.nameMr, 'name');
  const brand = cleanLabel(input.brand, 'brand');
  const liquorType = cleanLabel(input.liquorType, 'type');
  const subType = cleanLabel(input.subType, 'type');
  const serviceStation = resolveServiceStation(input.serviceStation, liquorType);

  const volumeText = input.volumeMl.trim();
  const volumeMl = Number(volumeText);
  if (!/^\d{1,5}$/.test(volumeText) || !Number.isInteger(volumeMl) || volumeMl < 1 || volumeMl > 20000) {
    throw new InventoryValidationError('volume');
  }

  const purchasePaise = parseRupeeToPaise(input.purchasePrice);
  const sellingPaise = parseRupeeToPaise(input.sellingPrice);
  if (purchasePaise === null || sellingPaise === null) {
    throw new InventoryValidationError('price');
  }

  const thresholdText = input.lowStockThreshold.trim();
  const lowStockThreshold = Number(thresholdText);
  if (!/^\d{1,4}$/.test(thresholdText) || !Number.isInteger(lowStockThreshold)) {
    throw new InventoryValidationError('threshold');
  }

  return {
    itemCode,
    nameEn,
    nameMr,
    brand,
    liquorType,
    subType,
    serviceStation,
    volumeMl,
    purchasePrice: purchasePaise / 100,
    sellingPrice: sellingPaise / 100,
    lowStockThreshold,
  };
}

export function parseCatalogTerm(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 40) {
    throw new InventoryValidationError('label');
  }
  return clean;
}

export function parseVendor(input: VendorInput): { name: string; phone: string } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) {
    throw new InventoryValidationError('vendor');
  }

  const phone = input.phone.replace(/\D/g, '');
  if (phone.length > 0 && (phone.length < 8 || phone.length > 15)) {
    throw new InventoryValidationError('phone');
  }

  return { name, phone };
}

function cleanLabel(value: string, code: 'name' | 'brand' | 'type'): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) {
    throw new InventoryValidationError(code);
  }
  return clean;
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
