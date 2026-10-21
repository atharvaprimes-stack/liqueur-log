import { itemNames, knownTermLabel, type StockItem } from './models/inventory';
import type { ReportSheet, SheetCell, SheetColumn, SheetGroup, SheetTable } from './reports';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const CATALOG_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.serial'), align: 'right', width: 0.1 },
  { text: t('reports.code'), align: 'left', width: 0.18 },
  { text: t('reports.name'), align: 'left', width: 0.38 },
  { text: t('reports.category'), align: 'left', width: 0.18 },
  { text: t('reports.type'), align: 'left', width: 0.16 },
];

export function presentCatalogSheet(
  items: StockItem[],
  typeOrder: readonly string[],
  tenant: { businessName: string; licenseNumber: string; address: string },
  t: Translate,
  language: string,
  generatedAt = Date.now(),
): ReportSheet {
  const sorted = flattenCatalog(items, typeOrder, language);

  return {
    fileName: catalogFileName(generatedAt),
    businessName: tenant.businessName.trim() || t('appName'),
    licenseLine: tenant.licenseNumber.trim()
      ? t('reports.license', { number: tenant.licenseNumber.trim() })
      : '',
    address: tenant.address.trim(),
    title: t('reports.catalogReport'),
    period: t('reports.catalogCount', { count: sorted.length }),
    generated: t('reports.generated', { stamp: formatStamp(generatedAt, t) }),
    continued: t('reports.continued'),
    footnote: t('reports.catalogFootnote'),
    summaryLeft: [],
    summaryRight: [],
    table: catalogTable(sorted, t, language),
  };
}

function catalogTable(items: StockItem[], t: Translate, language: string): SheetTable {
  const columns = CATALOG_COLUMNS(t);
  if (items.length === 0) {
    return {
      title: t('reports.catalog'),
      columns,
      groups: [],
      extra: null,
      grand: null,
      empty: t('reports.noCatalog'),
    };
  }

  const rows: SheetCell[][] = items.map((item) => [
    { text: String(item.serialNo) },
    { text: item.itemCode.trim() },
    { text: itemNames(item, language).primary.trim() || '—' },
    { text: knownTermLabel('types', item.liquorType, t) },
    { text: item.subType.trim() ? knownTermLabel('subTypes', item.subType, t) : '—' },
  ]);

  const group: SheetGroup = {
    title: '',
    note: null,
    bands: [{ title: null, rows }],
    total: null,
  };

  return {
    title: t('reports.catalog'),
    columns,
    groups: [group],
    extra: null,
    grand: null,
    empty: null,
  };
}

function flattenCatalog(items: StockItem[], _typeOrder: readonly string[], _language: string): StockItem[] {
  return [...items].sort(
    (left, right) =>
      left.serialNo - right.serialNo ||
      left.itemCode.localeCompare(right.itemCode, undefined, { sensitivity: 'base' }),
  );
}

function catalogFileName(generatedAt: number): string {
  const date = new Date(generatedAt);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `catalog-${date.getFullYear()}-${month}-${day}.pdf`;
}

function formatStamp(timestamp: number, t: Translate): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${t(`reports.monthShort.${date.getMonth() + 1}`)} ${date.getFullYear()}  ${hours}:${minutes}`;
}
