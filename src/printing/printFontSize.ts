import { readPreference, writePreference } from '../data/local/preferences';

export const PRINT_FONT_SIZES = ['small', 'medium', 'large'] as const;

export type PrintFontSize = (typeof PRINT_FONT_SIZES)[number];

const KEY = 'thermal.printFontSize.v1';

export function isPrintFontSize(value: unknown): value is PrintFontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export async function getPrintFontSize(): Promise<PrintFontSize> {
  const raw = await readPreference(KEY);
  return isPrintFontSize(raw) ? raw : 'small';
}

export async function savePrintFontSize(size: PrintFontSize): Promise<void> {
  await writePreference(KEY, size);
}
