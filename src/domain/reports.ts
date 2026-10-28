import { isLowStock, itemNames, knownTermLabel, compactVolume, type StockItem } from './models/inventory';
import { formatInrFromPaise } from './money';

export type ReportPreset = 'day' | 'month' | 'custom';
export type ReportKind = 'sales' | 'purchases' | 'stock';

export type ReportBounds = {
  from: number;
  until: number;
};

export type MovementRow = {
  day: string;
  itemId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  liquorType: string;
  volumeMl: number;
  quantity: number;
  amount: number;
  unitPaise: number;
  staffName: string;
};

export type SalesDayRow = {
  day: string;
  billCount: number;
  salesAmount: number;
  cashAmount: number;
  upiAmount: number;
  otherAmount: number;
  creditAmount: number;
};

export type PurchaseLineRow = MovementRow & {
  supplierName: string;
  invoiceNumber: string;
};

export type PurchaseDayRow = {
  day: string;
  invoiceCount: number;
  purchaseAmount: number;
  purchaseCredit: number;
};

export type ReportSource = {
  salesLines: MovementRow[];
  salesDays: SalesDayRow[];
  purchaseLines: PurchaseLineRow[];
  purchaseDays: PurchaseDayRow[];
  stock: StockItem[];
  typeOrder: string[];
};

export type ReportItem = {
  itemId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  liquorType: string;
  volumeMl: number;
  quantity: number;
  amountPaise: number;
  staffName: string;
};

export type PurchaseInvoice = {
  supplierName: string;
  invoiceNumber: string;
  lines: ReportItem[];
};

export type SalesDay = {
  day: number;
  billCount: number;
  salesPaise: number;
  linePaise: number;
  cashPaise: number;
  upiPaise: number;
  otherPaise: number;
  creditPaise: number;
  quantity: number;
  lines: ReportItem[];
};

export type PurchaseDay = {
  day: number;
  invoiceCount: number;
  amountPaise: number;
  linePaise: number;
  creditPaise: number;
  quantity: number;
  invoices: PurchaseInvoice[];
};

export type StockReportItem = {
  itemId: string;
  itemCode: string;
  nameEn: string;
  nameMr: string;
  liquorType: string;
  volumeMl: number;
  received: number;
  sold: number;
  onHand: number;
  low: boolean;
  costPaise: number;
};

export type ItemSection<T> = {
  liquorType: string;
  lines: T[];
};

export type BusinessReport = {
  businessName: string;
  licenseNumber: string;
  address: string;
  from: number;
  until: number;
  generatedAt: number;
  sales: {
    billCount: number;
    salesPaise: number;
    linePaise: number;
    cashPaise: number;
    upiPaise: number;
    otherPaise: number;
    creditPaise: number;
    quantity: number;
    days: SalesDay[];
  };
  purchases: {
    invoiceCount: number;
    amountPaise: number;
    linePaise: number;
    creditPaise: number;
    quantity: number;
    days: PurchaseDay[];
  };
  stock: {
    onHand: number;
    costPaise: number;
    salePaise: number;
    lowCount: number;
    received: number;
    sold: number;
    sections: ItemSection<StockReportItem>[];
  };
};

export type SheetTone = 'danger' | 'muted';

export type SheetCell = {
  text: string;
  tone?: SheetTone;
};

export type SheetColumn = {
  text: string;
  align: 'left' | 'right';
  width: number;
};

export type SheetBand = {
  title: string | null;
  rows: SheetCell[][];
};

export type SheetGroup = {
  title: string;
  note: string | null;
  bands: SheetBand[];
  total: SheetCell[] | null;
  /** When true, PDF painter starts this group on a fresh page (e.g. catalog stations). */
  breakBefore?: boolean;
};

export type SheetTable = {
  title: string;
  columns: SheetColumn[];
  groups: SheetGroup[];
  extra: SheetCell[] | null;
  grand: SheetCell[] | null;
  empty: string | null;
  /** When true, each group title is painted above its column header (catalog stations). */
  sectionPerGroup?: boolean;
  /**
   * Newspaper-style flow: fill column 1 top→bottom, then column 2 on the same page.
   * `columns` describe one strip; widths are fractions within that strip.
   */
  flowColumns?: number;
};

export type SummaryPair = {
  label: string;
  value: string;
  strong?: boolean;
};

export type ReportSheet = {
  fileName: string;
  businessName: string;
  licenseLine: string;
  address: string;
  title: string;
  period: string;
  generated: string;
  continued: string;
  footnote: string;
  summaryLeft: SummaryPair[];
  summaryRight: SummaryPair[];
  table: SheetTable;
};

export type ReportPreview = {
  period: string;
  detail: string;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

const MAX_SPAN_MS = 366 * 24 * 60 * 60 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const PURCHASE_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.item'), align: 'left', width: 0.4 },
  { text: t('reports.volume'), align: 'left', width: 0.14 },
  { text: t('reports.qty'), align: 'right', width: 0.1 },
  { text: t('reports.rate'), align: 'right', width: 0.16 },
  { text: t('reports.amount'), align: 'right', width: 0.2 },
];

const SALES_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.item'), align: 'left', width: 0.3 },
  { text: t('reports.volume'), align: 'left', width: 0.11 },
  { text: t('reports.qty'), align: 'right', width: 0.08 },
  { text: t('reports.rate'), align: 'right', width: 0.13 },
  { text: t('reports.amount'), align: 'right', width: 0.16 },
  { text: t('reports.soldBy'), align: 'left', width: 0.22 },
];

const STOCK_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.item'), align: 'left', width: 0.38 },
  { text: t('reports.received'), align: 'right', width: 0.12 },
  { text: t('reports.sold'), align: 'right', width: 0.12 },
  { text: t('reports.onHand'), align: 'right', width: 0.14 },
  { text: t('reports.value'), align: 'right', width: 0.24 },
];

export function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function resolveReportBounds(
  preset: ReportPreset,
  fromKey: string,
  toKey: string,
  now = Date.now(),
): ReportBounds | null {
  if (preset === 'day') {
    const from = startOfLocalDay(now);
    return { from, until: addLocalDays(from, 1) };
  }
  if (preset === 'month') {
    const date = new Date(now);
    const from = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const until = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    return { from, until };
  }

  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (from === null || to === null || from > to) {
    return null;
  }
  const until = addLocalDays(to, 1);
  if (until - from > MAX_SPAN_MS) {
    return null;
  }
  return { from, until };
}

export function buildBusinessReport(
  source: ReportSource,
  tenant: { businessName: string; licenseNumber: string; address: string },
  bounds: ReportBounds,
  generatedAt = Date.now(),
): BusinessReport {
  const salesDays = buildSalesDays(source);
  const purchaseDays = buildPurchaseDays(source);
  const stock = buildStock(source);

  return {
    businessName: tenant.businessName.trim(),
    licenseNumber: tenant.licenseNumber.trim(),
    address: tenant.address.trim(),
    from: bounds.from,
    until: bounds.until,
    generatedAt,
    sales: {
      billCount: salesDays.reduce((sum, day) => sum + day.billCount, 0),
      salesPaise: salesDays.reduce((sum, day) => sum + day.salesPaise, 0),
      linePaise: salesDays.reduce((sum, day) => sum + day.linePaise, 0),
      cashPaise: salesDays.reduce((sum, day) => sum + day.cashPaise, 0),
      upiPaise: salesDays.reduce((sum, day) => sum + day.upiPaise, 0),
      otherPaise: salesDays.reduce((sum, day) => sum + day.otherPaise, 0),
      creditPaise: salesDays.reduce((sum, day) => sum + day.creditPaise, 0),
      quantity: salesDays.reduce((sum, day) => sum + day.quantity, 0),
      days: salesDays,
    },
    purchases: {
      invoiceCount: purchaseDays.reduce((sum, day) => sum + day.invoiceCount, 0),
      amountPaise: purchaseDays.reduce((sum, day) => sum + day.amountPaise, 0),
      linePaise: purchaseDays.reduce((sum, day) => sum + day.linePaise, 0),
      creditPaise: purchaseDays.reduce((sum, day) => sum + day.creditPaise, 0),
      quantity: purchaseDays.reduce((sum, day) => sum + day.quantity, 0),
      days: purchaseDays,
    },
    stock,
  };
}

export function describeReport(report: BusinessReport, kind: ReportKind, t: Translate): ReportPreview {
  const period = periodLabel(report.from, report.until, t);
  if (kind === 'sales') {
    if (report.sales.days.length === 0) {
      return { period, detail: t('reports.noSales') };
    }
    return {
      period,
      detail: t('reports.summaryLine', {
        count: report.sales.billCount,
        amount: formatInrFromPaise(report.sales.salesPaise),
      }),
    };
  }
  if (kind === 'purchases') {
    if (report.purchases.days.length === 0) {
      return { period, detail: t('reports.noPurchases') };
    }
    return {
      period,
      detail: t('reports.summaryLine', {
        count: report.purchases.invoiceCount,
        amount: formatInrFromPaise(report.purchases.amountPaise),
      }),
    };
  }
  if (report.stock.sections.length === 0) {
    return { period, detail: t('reports.noStock') };
  }
  return {
    period,
    detail: t('reports.stockSummary', {
      count: report.stock.onHand,
      amount: formatInrFromPaise(report.stock.costPaise),
    }),
  };
}

export function presentReport(report: BusinessReport, kind: ReportKind, t: Translate, language: string): ReportSheet {
  const period = periodLabel(report.from, report.until, t);
  const titleKey =
    kind === 'sales' ? 'reports.salesReport' : kind === 'purchases' ? 'reports.purchaseReport' : 'reports.stockReport';
  const footnoteKey =
    kind === 'sales'
      ? 'reports.salesFootnote'
      : kind === 'purchases'
        ? 'reports.purchaseFootnote'
        : 'reports.stockFootnote';
  const columns =
    kind === 'stock' ? STOCK_COLUMNS(t) : kind === 'sales' ? SALES_COLUMNS(t) : PURCHASE_COLUMNS(t);

  return {
    fileName: reportFileName(kind, report.from, report.until),
    businessName: report.businessName || t('appName'),
    licenseLine: report.licenseNumber ? t('reports.license', { number: report.licenseNumber }) : '',
    address: report.address,
    title: t(titleKey),
    period,
    generated: t('reports.generated', { stamp: formatStamp(report.generatedAt, t) }),
    continued: t('reports.continued'),
    footnote: t(footnoteKey),
    summaryLeft:
      kind === 'sales'
        ? salesSummaryLeft(report, t)
        : kind === 'purchases'
          ? purchaseSummaryLeft(report, t)
          : stockSummaryLeft(report, t),
    summaryRight:
      kind === 'sales'
        ? salesSummaryRight(report, t)
        : kind === 'purchases'
          ? purchaseSummaryRight(report, t)
          : stockSummaryRight(report, t),
    table:
      kind === 'sales'
        ? salesTable(report, columns, t, language)
        : kind === 'purchases'
          ? purchaseTable(report, columns, t, language)
          : stockTable(report, columns, t, language),
  };
}

export function reportFileName(kind: ReportKind, from: number, until: number): string {
  const start = formatDateKey(from);
  const end = formatDateKey(addLocalDays(until, -1));
  const span = start === end ? start : `${start}_${end}`;
  return `${kind}-${span}.pdf`;
}

function salesSummaryLeft(report: BusinessReport, t: Translate): SummaryPair[] {
  return [{ label: t('reports.sales'), value: formatInrFromPaise(report.sales.salesPaise), strong: true }];
}

function salesSummaryRight(report: BusinessReport, t: Translate): SummaryPair[] {
  return [{ label: t('reports.bills'), value: String(report.sales.billCount), strong: true }];
}

function purchaseSummaryLeft(report: BusinessReport, t: Translate): SummaryPair[] {
  const purchases = report.purchases;
  const pairs: SummaryPair[] = [
    { label: t('reports.purchases'), value: formatInrFromPaise(purchases.amountPaise), strong: true },
    { label: t('reports.paid'), value: formatInrFromPaise(purchases.amountPaise - purchases.creditPaise) },
  ];
  if (purchases.creditPaise !== 0) {
    pairs.push({ label: t('reports.credit'), value: formatInrFromPaise(purchases.creditPaise) });
  }
  return pairs;
}

function purchaseSummaryRight(report: BusinessReport, t: Translate): SummaryPair[] {
  return [
    { label: t('reports.invoices'), value: String(report.purchases.invoiceCount), strong: true },
    { label: t('reports.qtyIn'), value: String(report.purchases.quantity) },
  ];
}

function stockSummaryLeft(report: BusinessReport, t: Translate): SummaryPair[] {
  return [
    { label: t('reports.onHand'), value: String(report.stock.onHand), strong: true },
    { label: t('reports.value'), value: formatInrFromPaise(report.stock.costPaise), strong: true },
    { label: t('reports.saleValue'), value: formatInrFromPaise(report.stock.salePaise) },
  ];
}

function stockSummaryRight(report: BusinessReport, t: Translate): SummaryPair[] {
  return [
    { label: t('reports.received'), value: String(report.stock.received) },
    { label: t('reports.sold'), value: String(report.stock.sold) },
    { label: t('reports.lowStock'), value: String(report.stock.lowCount) },
  ];
}

function salesTable(report: BusinessReport, columns: SheetColumn[], t: Translate, language: string): SheetTable {
  if (report.sales.days.length === 0) {
    return { title: t('reports.sales'), columns, groups: [], extra: null, grand: null, empty: t('reports.noSales') };
  }

  const groups = report.sales.days.map((day) => {
    const date = formatShortDate(day.day, t);
    const rows = sortByName(day.lines, language).map((line) => salesLineCells(line, t, language));
    const roundOff = day.salesPaise - day.linePaise;
    if (roundOff !== 0) {
      rows.push(salesMutedRow(t('reports.roundOff'), formatInrFromPaise(roundOff)));
    }
    return {
      title: date,
      note: salesDayNote(day, t),
      bands: [{ title: null, rows }],
      total: salesTotalCells(t('reports.groupTotal', { name: date }), day.quantity, day.salesPaise),
    };
  });

  return {
    title: t('reports.sales'),
    columns,
    groups,
    extra: null,
    grand:
      groups.length > 1
        ? salesTotalCells(t('reports.total'), report.sales.quantity, report.sales.salesPaise)
        : null,
    empty: null,
  };
}

function purchaseTable(report: BusinessReport, columns: SheetColumn[], t: Translate, language: string): SheetTable {
  if (report.purchases.days.length === 0) {
    return {
      title: t('reports.purchases'),
      columns,
      groups: [],
      extra: null,
      grand: null,
      empty: t('reports.noPurchases'),
    };
  }

  const groups = report.purchases.days.map((day) => {
    const date = formatShortDate(day.day, t);
    const bands: SheetBand[] = day.invoices.map((invoice) => ({
      title: `${invoice.supplierName}  ·  ${invoice.invoiceNumber}`,
      rows: sortByName(invoice.lines, language).map((line) => purchaseLineCells(line, t, language)),
    }));
    const roundOff = day.amountPaise - day.linePaise;
    if (roundOff !== 0) {
      bands.push({ title: null, rows: [purchaseMutedRow(t('reports.roundOff'), formatInrFromPaise(roundOff))] });
    }
    return {
      title: date,
      note: purchaseDayNote(day, t),
      bands,
      total: purchaseTotalCells(t('reports.groupTotal', { name: date }), day.quantity, day.amountPaise),
    };
  });

  return {
    title: t('reports.purchases'),
    columns,
    groups,
    extra: null,
    grand:
      groups.length > 1
        ? purchaseTotalCells(t('reports.total'), report.purchases.quantity, report.purchases.amountPaise)
        : null,
    empty: null,
  };
}

function stockTable(report: BusinessReport, columns: SheetColumn[], t: Translate, language: string): SheetTable {
  if (report.stock.sections.length === 0) {
    return { title: t('reports.stock'), columns, groups: [], extra: null, grand: null, empty: t('reports.noStock') };
  }

  let received = 0;
  let sold = 0;
  const groups = report.stock.sections.map((section) => {
    const lines = sortByName(section.lines, language);
    const title = knownTermLabel('types', section.liquorType, t);
    const rows = lines.map((line) => [
      itemCell(line, language),
      { text: String(line.received) },
      { text: String(line.sold) },
      { text: String(line.onHand), tone: line.low ? ('danger' as const) : undefined },
      { text: formatInrFromPaise(line.costPaise) },
    ]);
    const sectionReceived = lines.reduce((sum, line) => sum + line.received, 0);
    const sectionSold = lines.reduce((sum, line) => sum + line.sold, 0);
    const sectionOnHand = lines.reduce((sum, line) => sum + line.onHand, 0);
    const sectionCost = lines.reduce((sum, line) => sum + line.costPaise, 0);
    received += sectionReceived;
    sold += sectionSold;
    return {
      title,
      note: null,
      bands: [{ title: null, rows }],
      total: [
        { text: t('reports.groupTotal', { name: title }) },
        { text: String(sectionReceived) },
        { text: String(sectionSold) },
        { text: String(sectionOnHand) },
        { text: formatInrFromPaise(sectionCost) },
      ],
    };
  });

  return {
    title: t('reports.stock'),
    columns,
    groups,
    extra: null,
    grand:
      groups.length > 1
        ? [
            { text: t('reports.total') },
            { text: String(received) },
            { text: String(sold) },
            { text: String(report.stock.onHand) },
            { text: formatInrFromPaise(report.stock.costPaise) },
          ]
        : null,
    empty: null,
  };
}

function salesDayNote(day: SalesDay, t: Translate): string {
  const parts = [t('reports.dayBills', { count: day.billCount })];
  if (day.cashPaise !== 0) {
    parts.push(`${t('reports.cash')} ${formatInrFromPaise(day.cashPaise)}`);
  }
  if (day.upiPaise !== 0) {
    parts.push(`${t('reports.upi')} ${formatInrFromPaise(day.upiPaise)}`);
  }
  if (day.otherPaise !== 0) {
    parts.push(`${t('reports.other')} ${formatInrFromPaise(day.otherPaise)}`);
  }
  if (day.creditPaise !== 0) {
    parts.push(`${t('reports.credit')} ${formatInrFromPaise(day.creditPaise)}`);
  }
  return parts.join('   ·   ');
}

function purchaseDayNote(day: PurchaseDay, t: Translate): string {
  const parts = [t('reports.dayBills', { count: day.invoiceCount })];
  if (day.creditPaise !== 0) {
    parts.push(`${t('reports.credit')} ${formatInrFromPaise(day.creditPaise)}`);
  }
  return parts.join('   ·   ');
}

function salesLineCells(line: ReportItem, t: Translate, language: string): SheetCell[] {
  return [
    itemCell(line, language),
    { text: volumeLabel(line, t) },
    { text: String(line.quantity) },
    { text: rateLabel(line) },
    { text: formatInrFromPaise(line.amountPaise) },
    { text: line.staffName.trim() || '—', tone: line.staffName.trim() ? undefined : 'muted' },
  ];
}

function purchaseLineCells(line: ReportItem, t: Translate, language: string): SheetCell[] {
  return [
    itemCell(line, language),
    { text: volumeLabel(line, t) },
    { text: String(line.quantity) },
    { text: rateLabel(line) },
    { text: formatInrFromPaise(line.amountPaise) },
  ];
}

function salesTotalCells(label: string, quantity: number, amountPaise: number): SheetCell[] {
  return [
    { text: label },
    { text: '' },
    { text: String(quantity) },
    { text: '' },
    { text: formatInrFromPaise(amountPaise) },
    { text: '' },
  ];
}

function purchaseTotalCells(label: string, quantity: number, amountPaise: number): SheetCell[] {
  return [{ text: label }, { text: '' }, { text: String(quantity) }, { text: '' }, { text: formatInrFromPaise(amountPaise) }];
}

function salesMutedRow(label: string, amount: string): SheetCell[] {
  return [
    { text: label, tone: 'muted' },
    { text: '' },
    { text: '' },
    { text: '' },
    { text: amount, tone: 'muted' },
    { text: '' },
  ];
}

function purchaseMutedRow(label: string, amount: string): SheetCell[] {
  return [
    { text: label, tone: 'muted' },
    { text: '' },
    { text: '' },
    { text: '' },
    { text: amount, tone: 'muted' },
  ];
}

function rateLabel(line: ReportItem): string {
  if (line.quantity <= 0) {
    return '';
  }
  return formatInrFromPaise(Math.round(line.amountPaise / line.quantity));
}

function sortByName<
  T extends { nameEn: string; nameMr: string; volumeMl: number; itemCode: string; staffName?: string },
>(lines: T[], language: string): T[] {
  return [...lines].sort((left, right) => {
    const leftName = itemNames(left, language).primary;
    const rightName = itemNames(right, language).primary;
    return (
      leftName.localeCompare(rightName, language, { sensitivity: 'base' }) ||
      left.volumeMl - right.volumeMl ||
      left.itemCode.localeCompare(right.itemCode) ||
      (left.staffName ?? '').localeCompare(right.staffName ?? '', language, { sensitivity: 'base' })
    );
  });
}

function itemCell(item: { itemCode: string; nameEn: string; nameMr: string }, language: string): SheetCell {
  const name = itemNames(item, language).primary.trim();
  const code = item.itemCode.trim();
  return { text: name && code ? `${code}  ${name}` : name || code };
}

function volumeLabel(item: { volumeMl: number; liquorType: string }, t: Translate): string {
  const volume = compactVolume(item);
  return t(volume.key, volume.values);
}

function periodLabel(from: number, until: number, t: Translate): string {
  if (isSingleDay(from, until)) {
    return formatShortDate(from, t);
  }
  if (isFullMonth(from, until)) {
    const date = new Date(from);
    return `${t(`reports.monthLong.${date.getMonth() + 1}`)} ${date.getFullYear()}`;
  }
  return `${formatShortDate(from, t)} – ${formatShortDate(addLocalDays(until, -1), t)}`;
}

function formatStamp(timestamp: number, t: Translate): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatShortDate(timestamp, t)}  ${hours}:${minutes}`;
}

function formatShortDate(timestamp: number, t: Translate): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${t(`reports.monthShort.${date.getMonth() + 1}`)} ${date.getFullYear()}`;
}

function isSingleDay(from: number, until: number): boolean {
  return startOfLocalDay(from) === from && addLocalDays(from, 1) === until;
}

function isFullMonth(from: number, until: number): boolean {
  const start = new Date(from);
  if (start.getDate() !== 1 || start.getTime() !== startOfLocalDay(from)) {
    return false;
  }
  return until === new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
}

function buildStock(source: ReportSource): BusinessReport['stock'] {
  const soldById = new Map<string, number>();
  for (const line of source.salesLines) {
    soldById.set(line.itemId, (soldById.get(line.itemId) ?? 0) + line.quantity);
  }
  const receivedById = new Map<string, number>();
  for (const line of source.purchaseLines) {
    receivedById.set(line.itemId, (receivedById.get(line.itemId) ?? 0) + line.quantity);
  }

  const lines: StockReportItem[] = [];
  let onHand = 0;
  let costPaise = 0;
  let salePaise = 0;
  let lowCount = 0;
  let received = 0;
  let sold = 0;
  for (const item of source.stock) {
    const itemReceived = receivedById.get(item.id) ?? 0;
    const itemSold = soldById.get(item.id) ?? 0;
    if (item.currentStock <= 0 && itemReceived <= 0 && itemSold <= 0) {
      continue;
    }
    const cost = Math.round(item.purchasePrice * 100) * item.currentStock;
    const sale = Math.round(item.sellingPrice * 100) * item.currentStock;
    const low = isLowStock(item);
    lines.push({
      itemId: item.id,
      itemCode: item.itemCode,
      nameEn: item.nameEn,
      nameMr: item.nameMr,
      liquorType: item.liquorType,
      volumeMl: item.volumeMl,
      received: itemReceived,
      sold: itemSold,
      onHand: item.currentStock,
      low,
      costPaise: cost,
    });
    onHand += item.currentStock;
    costPaise += cost;
    salePaise += sale;
    received += itemReceived;
    sold += itemSold;
    if (low) {
      lowCount += 1;
    }
  }

  return {
    onHand,
    costPaise,
    salePaise,
    lowCount,
    received,
    sold,
    sections: groupByType(lines, source.typeOrder),
  };
}

function groupByType<T extends { liquorType: string }>(lines: T[], typeOrder: readonly string[]): ItemSection<T>[] {
  const names = [...typeOrder];
  for (const line of lines) {
    if (!names.includes(line.liquorType)) {
      names.push(line.liquorType);
    }
  }
  return names.flatMap((liquorType) => {
    const grouped = lines.filter((line) => line.liquorType === liquorType);
    return grouped.length > 0 ? [{ liquorType, lines: grouped }] : [];
  });
}

function buildSalesDays(source: ReportSource): SalesDay[] {
  const linesByDay = groupBy(source.salesLines, (line) => line.day);
  const totalsByDay = new Map(source.salesDays.map((row) => [row.day, row]));
  return [...new Set([...linesByDay.keys(), ...totalsByDay.keys()])].sort().flatMap((dayKey) => {
    const day = parseDateKey(dayKey);
    const total = totalsByDay.get(dayKey);
    if (day === null) {
      return [];
    }
    const lines = mergeMovement(linesByDay.get(dayKey) ?? []);
    const linePaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
    if (lines.length === 0 && (total?.billCount ?? 0) === 0) {
      return [];
    }
    return [
      {
        day,
        billCount: total?.billCount ?? 0,
        salesPaise: total ? rupeesToPaise(total.salesAmount) : linePaise,
        linePaise,
        cashPaise: rupeesToPaise(total?.cashAmount ?? 0),
        upiPaise: rupeesToPaise(total?.upiAmount ?? 0),
        otherPaise: rupeesToPaise(total?.otherAmount ?? 0),
        creditPaise: rupeesToPaise(total?.creditAmount ?? 0),
        quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        lines,
      },
    ];
  });
}

function buildPurchaseDays(source: ReportSource): PurchaseDay[] {
  const invoicesByDay = new Map<string, Map<string, PurchaseInvoice & { raw: MovementRow[] }>>();
  for (const line of source.purchaseLines) {
    let dayInvoices = invoicesByDay.get(line.day);
    if (!dayInvoices) {
      dayInvoices = new Map();
      invoicesByDay.set(line.day, dayInvoices);
    }
    const key = `${line.supplierName}\u0000${line.invoiceNumber}`;
    const invoice = dayInvoices.get(key) ?? {
      supplierName: line.supplierName,
      invoiceNumber: line.invoiceNumber,
      lines: [],
      raw: [],
    };
    invoice.raw.push(line);
    dayInvoices.set(key, invoice);
  }

  const totalsByDay = new Map(source.purchaseDays.map((row) => [row.day, row]));
  return [...new Set([...invoicesByDay.keys(), ...totalsByDay.keys()])].sort().flatMap((dayKey) => {
    const day = parseDateKey(dayKey);
    const total = totalsByDay.get(dayKey);
    if (day === null) {
      return [];
    }
    const invoices = [...(invoicesByDay.get(dayKey)?.values() ?? [])]
      .map((invoice) => ({
        supplierName: invoice.supplierName,
        invoiceNumber: invoice.invoiceNumber,
        lines: mergeMovement(invoice.raw),
      }))
      .sort(
        (left, right) =>
          left.supplierName.localeCompare(right.supplierName, undefined, { sensitivity: 'base' }) ||
          left.invoiceNumber.localeCompare(right.invoiceNumber, undefined, { numeric: true, sensitivity: 'base' }),
      );
    const lines = invoices.flatMap((invoice) => invoice.lines);
    const linePaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
    if (invoices.length === 0 && (total?.invoiceCount ?? 0) === 0) {
      return [];
    }
    return [
      {
        day,
        invoiceCount: total?.invoiceCount ?? invoices.length,
        amountPaise: total ? rupeesToPaise(total.purchaseAmount) : linePaise,
        linePaise,
        creditPaise: rupeesToPaise(total?.purchaseCredit ?? 0),
        quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        invoices,
      },
    ];
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const name = key(row);
    const bucket = grouped.get(name);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(name, [row]);
    }
  }
  return grouped;
}

function mergeMovement(rows: MovementRow[]): ReportItem[] {
  const merged = new Map<string, ReportItem>();
  for (const row of rows) {
    const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
    const amountPaise = rupeesToPaise(row.amount);
    const staffName = row.staffName.trim();
    const key = `${row.itemId}\u0000${row.itemCode}\u0000${row.nameEn}\u0000${row.nameMr}\u0000${row.volumeMl}\u0000${row.unitPaise}\u0000${staffName}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        itemId: row.itemId,
        itemCode: row.itemCode,
        nameEn: row.nameEn,
        nameMr: row.nameMr,
        liquorType: row.liquorType,
        volumeMl: row.volumeMl,
        quantity,
        amountPaise,
        staffName,
      });
      continue;
    }
    existing.quantity += quantity;
    existing.amountPaise += amountPaise;
  }
  return [...merged.values()];
}

function rupeesToPaise(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

function parseDateKey(value: string): number | null {
  const match = DATE_KEY.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}
