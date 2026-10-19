export type DateRange = {
  from: string;
  to: string;
};

export const RANGE_PRESETS = ['today', 'week', 'month'] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Independent Sales Overview chart windows (not the metric KPI period). */
export const CHART_PERIODS = ['days7', 'months12'] as const;

export type ChartPeriod = (typeof CHART_PERIODS)[number];

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateKey(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date | null {
  const match = KEY.exec(key);
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
  return date;
}

export function normalizeRange(range: DateRange): DateRange {
  if (range.from <= range.to) {
    return range;
  }
  return { from: range.to, to: range.from };
}

export function rangeBounds(range: DateRange): { start: number; end: number } | null {
  const normalized = normalizeRange(range);
  const start = parseDateKey(normalized.from);
  const inclusiveEnd = parseDateKey(normalized.to);
  if (!start || !inclusiveEnd) {
    return null;
  }

  const end = new Date(inclusiveEnd.getFullYear(), inclusiveEnd.getMonth(), inclusiveEnd.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export function todayRange(now = new Date()): DateRange {
  const key = dateKey(now);
  return { from: key, to: key };
}

export function yesterdayRange(now = new Date()): DateRange {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const key = dateKey(date);
  return { from: key, to: key };
}

export function weekRange(now = new Date()): DateRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  return { from: dateKey(start), to: dateKey(end) };
}

export function monthRange(now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: dateKey(start), to: dateKey(end) };
}

export function previousPresetRange(preset: RangePreset, now = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return yesterdayRange(now);
    case 'week': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      return { from: dateKey(start), to: dateKey(end) };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: dateKey(start), to: dateKey(end) };
    }
  }
}

export function presetRange(preset: RangePreset, now = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return todayRange(now);
    case 'week':
      return weekRange(now);
    case 'month':
      return monthRange(now);
  }
}

export function eachDateKey(range: DateRange): string[] {
  const normalized = normalizeRange(range);
  const start = parseDateKey(normalized.from);
  const end = parseDateKey(normalized.to);
  if (!start || !end) {
    return [];
  }

  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** First day of the month 11 months ago through last day of the current month. */
export function last12MonthsRange(now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: dateKey(start), to: dateKey(end) };
}

/** Ordered `YYYY-MM` keys covering the inclusive last-12-months window. */
export function eachMonthKey(now = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    keys.push(`${year}-${month}`);
  }
  return keys;
}

export function parseMonthKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return new Date(year, month - 1, 1);
}

export function formatShortDate(key: string, locale: string): string {
  const date = parseDateKey(key);
  if (!date) {
    return key;
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
