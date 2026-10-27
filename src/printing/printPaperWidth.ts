import { readPreference, writePreference } from '../data/local/preferences';

export const PRINT_PAPER_WIDTHS = [58, 80] as const;

export type PrintPaperWidth = (typeof PRINT_PAPER_WIDTHS)[number];

const KEY = 'thermal.paperWidthMm.v1';

export function parsePrintPaperWidth(value: unknown): PrintPaperWidth {
  if (value === 80 || value === '80') {
    return 80;
  }
  return 58;
}

export function isStoredPrintPaperWidth(value: unknown): boolean {
  return value === 58 || value === 80 || value === '58' || value === '80';
}

/** Default 58 — preserves existing installs and layouts. */
export async function getPrintPaperWidth(): Promise<PrintPaperWidth> {
  const raw = await readPreference(KEY);
  if (!isStoredPrintPaperWidth(raw)) {
    return 58;
  }
  return parsePrintPaperWidth(raw);
}

export async function savePrintPaperWidth(width: PrintPaperWidth): Promise<void> {
  await writePreference(KEY, String(width));
}
