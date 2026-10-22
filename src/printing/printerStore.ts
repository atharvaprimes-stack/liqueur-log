import { readPreference, writePreference } from '../data/local/preferences';

const PRINTER_KEY = 'thermal.printer.v1';

export type RegisteredPrinter = {
  name: string;
  address: string;
};

export async function getRegisteredPrinter(): Promise<RegisteredPrinter | null> {
  const raw = await readPreference(PRINTER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RegisteredPrinter>;
    if (typeof parsed.name === 'string' && typeof parsed.address === 'string' && parsed.address.trim()) {
      return { name: parsed.name.trim() || 'Printer', address: parsed.address.trim() };
    }
  } catch {
    // ignore corrupt preference
  }
  return null;
}

export async function saveRegisteredPrinter(printer: RegisteredPrinter): Promise<void> {
  await writePreference(
    PRINTER_KEY,
    JSON.stringify({
      name: printer.name.trim() || 'Printer',
      address: printer.address.trim(),
    }),
  );
}

export async function clearRegisteredPrinter(): Promise<void> {
  await writePreference(PRINTER_KEY, '');
}
