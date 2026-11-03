import { knownTermLabel, type StockItem } from './models/inventory';
import type { ReportSheet, SheetCell, SheetColumn, SheetGroup, SheetTable } from './reports';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const CATALOG_COLUMNS = (t: Translate): SheetColumn[] => [
  { text: t('reports.subType'), align: 'left', width: 0.18 },
  { text: t('reports.serial'), align: 'left', width: 0.08 },
  { text: t('catalog.nameMr'), align: 'left', width: 0.27 },
  { text: t('catalog.nameEn'), align: 'left', width: 0.27 },
  { text: t('reports.quantityMl'), align: 'right', width: 0.2 },
];

export function presentCatalogSheet(
  items: StockItem[],
  _typeOrder: readonly string[],
  tenant: { businessName: string; licenseNumber: string; address: string },
  t: Translate,
  _language: string,
  generatedAt = Date.now(),
): ReportSheet {
  return {
    fileName: catalogFileName(generatedAt),
    businessName: tenant.businessName.trim() || t('appName'),
    licenseLine: tenant.licenseNumber.trim()
      ? t('reports.license', { number: tenant.licenseNumber.trim() })
      : '',
    address: tenant.address.trim(),
    // Compact catalog: hotel block only in the PDF/preview header.
    title: '',
    period: '',
    generated: '',
    continued: t('reports.continued'),
    footnote: t('reports.catalogFootnote'),
    summaryLeft: [],
    summaryRight: [],
    table: catalogTable(items, t),
  };
}

/**
 * Pack item strips into wide rows.
 * - `row` (default): left→right, then next line (1|2, then 3|4, …).
 * - `column`: fill left strip top→bottom, then the right strip.
 */
export function packFlowColumns(
  itemRows: SheetCell[][],
  stripColumns: SheetColumn[],
  flowColumns: number,
  rowsPerColumn?: number,
  fill: 'row' | 'column' = 'row',
): { columns: SheetColumn[]; rows: SheetCell[][] } {
  const columns = Array.from({ length: flowColumns }, () => stripColumns).flat().map((column) => ({
    ...column,
    width: column.width / flowColumns,
  }));

  if (itemRows.length === 0) {
    return { columns, rows: [] };
  }

  const empty = stripColumns.map(() => ({ text: '' }));
  const rows: SheetCell[][] = [];

  if (fill === 'row') {
    for (let index = 0; index < itemRows.length; index += flowColumns) {
      const cells: SheetCell[] = [];
      for (let columnIndex = 0; columnIndex < flowColumns; columnIndex += 1) {
        const item = itemRows[index + columnIndex];
        cells.push(...(item ?? empty));
      }
      rows.push(cells);
    }
    return { columns, rows };
  }

  const perColumn = rowsPerColumn ?? Math.ceil(itemRows.length / flowColumns);
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

function catalogTable(items: StockItem[], t: Translate): SheetTable {
  const columns = CATALOG_COLUMNS(t);
  const sorted = sortCatalog(items);
  if (sorted.length === 0) {
    return {
      title: '',
      columns,
      groups: [],
      extra: null,
      grand: null,
      empty: t('reports.noCatalog'),
      typeScale: 1.45,
    };
  }

  const groups: SheetGroup[] = [
    {
      title: '',
      note: null,
      bands: [{ title: null, rows: rowsWithMergedSubTypes(sorted, t) }],
      total: null,
    },
  ];

  return {
    title: '',
    columns,
    groups,
    extra: null,
    grand: null,
    empty: null,
    typeScale: 1.45,
  };
}

function rowsWithMergedSubTypes(items: StockItem[], t: Translate): SheetCell[][] {
  const rows: SheetCell[][] = [];
  let index = 0;
  while (index < items.length) {
    const current = items[index]!;
    const key = subTypeKey(current);
    let end = index + 1;
    while (end < items.length && subTypeKey(items[end]!) === key) {
      end += 1;
    }
    const span = end - index;
    const label = knownTermLabel('subTypes', current.subType, t).trim() || current.subType.trim() || '—';
    for (let offset = 0; offset < span; offset += 1) {
      const item = items[index + offset]!;
      const subTypeCell: SheetCell =
        offset === 0
          ? { text: label, rowSpan: span, wrap: true }
          : offset < span - 1
            ? { text: '', mergeContinue: true }
            : { text: '' };
      rows.push([
        subTypeCell,
        { text: String(item.serialNo) },
        { text: item.nameMr.trim() || '—' },
        { text: item.nameEn.trim() || '—' },
        { text: volumeMlLabel(item.volumeMl) },
      ]);
    }
    index = end;
  }
  return rows;
}

function subTypeKey(item: StockItem): string {
  return item.subType.trim().toLowerCase() || '—';
}

function volumeMlLabel(volumeMl: number): string {
  return volumeMl > 0 ? String(volumeMl) : '-';
}

function sortCatalog(items: StockItem[]): StockItem[] {
  // Keep each sub-type as one merged block, but order blocks so the list starts at serial 1
  // (alphabetical sub-type order was putting mid-range serials first).
  const bySubType = new Map<string, StockItem[]>();
  for (const item of items) {
    const key = subTypeKey(item);
    const bucket = bySubType.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      bySubType.set(key, [item]);
    }
  }

  const bySerialThenName = (left: StockItem, right: StockItem) =>
    left.serialNo - right.serialNo ||
    left.nameEn.localeCompare(right.nameEn, undefined, { sensitivity: 'base' });

  return [...bySubType.values()]
    .map((bucket) => [...bucket].sort(bySerialThenName))
    .sort((left, right) => left[0]!.serialNo - right[0]!.serialNo)
    .flat();
}

function catalogFileName(generatedAt: number): string {
  const date = new Date(generatedAt);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `catalog-${date.getFullYear()}-${month}-${day}.pdf`;
}
