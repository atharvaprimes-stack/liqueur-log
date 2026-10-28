import { itemNames, type StockItem } from './models/inventory';
import type { ReportSheet, SheetCell, SheetColumn, SheetGroup, SheetTable } from './reports';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** One item strip — duplicated side-by-side when flowing 2 columns on A4. */
const CATALOG_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.serial'), align: 'left', width: 0.28 },
  { text: t('reports.name'), align: 'left', width: 0.72 },
];

export function presentCatalogSheet(
  items: StockItem[],
  _typeOrder: readonly string[],
  tenant: { businessName: string; licenseNumber: string; address: string },
  t: Translate,
  language: string,
  generatedAt = Date.now(),
): ReportSheet {
  const bar = sortCatalog(items.filter((item) => item.showInBar));
  const kitchen = sortCatalog(items.filter((item) => item.showInKitchen));

  return {
    fileName: catalogFileName(generatedAt),
    businessName: tenant.businessName.trim() || t('appName'),
    licenseLine: tenant.licenseNumber.trim()
      ? t('reports.license', { number: tenant.licenseNumber.trim() })
      : '',
    address: tenant.address.trim(),
    title: t('reports.catalogReport'),
    period: t('reports.catalogCount', { count: items.length }),
    generated: t('reports.generated', { stamp: formatStamp(generatedAt, t) }),
    continued: t('reports.continued'),
    footnote: t('reports.catalogFootnote'),
    summaryLeft: [],
    summaryRight: [],
    table: catalogTable(bar, kitchen, t, language),
  };
}

/**
 * Pack items newspaper-style: fill the left column top→bottom, then the right.
 * `rowsPerColumn` is how many items fit in one column before wrapping to the next.
 */
export function packFlowColumns(
  itemRows: SheetCell[][],
  stripColumns: SheetColumn[],
  flowColumns: number,
  rowsPerColumn?: number,
): { columns: SheetColumn[]; rows: SheetCell[][] } {
  const columns = Array.from({ length: flowColumns }, () => stripColumns).flat().map((column) => ({
    ...column,
    width: column.width / flowColumns,
  }));

  if (itemRows.length === 0) {
    return { columns, rows: [] };
  }

  const perColumn = rowsPerColumn ?? Math.ceil(itemRows.length / flowColumns);
  const rows: SheetCell[][] = [];
  const empty = stripColumns.map(() => ({ text: '' }));

  for (let pageStart = 0; pageStart < itemRows.length; pageStart += perColumn * flowColumns) {
    const pageItems = itemRows.slice(pageStart, pageStart + perColumn * flowColumns);
    for (let rowIndex = 0; rowIndex < perColumn; rowIndex += 1) {
      const cells: SheetCell[] = [];
      let hasContent = false;
      for (let columnIndex = 0; columnIndex < flowColumns; columnIndex += 1) {
        const item = pageItems[columnIndex * perColumn + rowIndex];
        if (item) {
          cells.push(...item);
          hasContent = true;
        } else {
          cells.push(...empty);
        }
      }
      if (hasContent) {
        rows.push(cells);
      }
    }
  }

  return { columns, rows };
}

function catalogTable(
  bar: StockItem[],
  kitchen: StockItem[],
  t: Translate,
  language: string,
): SheetTable {
  const columns = CATALOG_COLUMNS(t);
  if (bar.length === 0 && kitchen.length === 0) {
    return {
      title: t('reports.catalog'),
      columns,
      groups: [],
      extra: null,
      grand: null,
      empty: t('reports.noCatalog'),
      sectionPerGroup: true,
      flowColumns: 2,
    };
  }

  const groups: SheetGroup[] = [];
  if (bar.length > 0) {
    groups.push(stationGroup(t('catalog.stationBar'), bar, language, false));
  }
  if (kitchen.length > 0) {
    groups.push(stationGroup(t('catalog.stationKitchen'), kitchen, language, groups.length > 0));
  }

  return {
    title: t('reports.catalog'),
    columns,
    groups,
    extra: null,
    grand: null,
    empty: null,
    sectionPerGroup: true,
    flowColumns: 2,
  };
}

function stationGroup(
  title: string,
  items: StockItem[],
  language: string,
  breakBefore: boolean,
): SheetGroup {
  return {
    title,
    note: null,
    bands: [{ title: null, rows: items.map((item) => itemCells(item, language)) }],
    total: null,
    breakBefore,
  };
}

function itemCells(item: StockItem, language: string): SheetCell[] {
  return [
    { text: String(item.serialNo) },
    { text: itemNames(item, language).primary.trim() || '—' },
  ];
}

function sortCatalog(items: StockItem[]): StockItem[] {
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
