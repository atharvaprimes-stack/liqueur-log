const MAX_RUPEE_WHOLE_DIGITS = 6;

export function sanitizeQuantityInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function sanitizeRupeeInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) {
    return cleaned.slice(0, MAX_RUPEE_WHOLE_DIGITS);
  }

  const whole = cleaned.slice(0, dot).slice(0, MAX_RUPEE_WHOLE_DIGITS);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${fraction}`;
}

export function parseQuantity(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,4}$/.test(trimmed)) {
    return null;
  }

  const quantity = Number(trimmed);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return null;
  }
  return quantity;
}

export function parseRupeeToPaise(input: string): number | null {
  const trimmed = input.trim();
  const withTrailingDot = /^\d{1,6}\.$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(withTrailingDot)) {
    return null;
  }

  const [whole, fraction = ''] = withTrailingDot.split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise < 0) {
    return null;
  }
  return paise;
}

export function formatRupeeInput(rupees: number): string {
  const paise = Math.round(rupees * 100);
  const whole = Math.floor(Math.abs(paise) / 100);
  const fraction = Math.abs(paise) % 100;
  if (fraction === 0) {
    return String(whole);
  }
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function formatInrFromPaise(paise: number): string {
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const whole = Math.floor(absolute / 100).toString();
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}₹${groupIndian(whole)}.${fraction}`;
}

export function formatInr(rupees: number): string {
  return formatInrFromPaise(Math.round(rupees * 100));
}

function groupIndian(whole: string): string {
  if (whole.length <= 3) {
    return whole;
  }

  const tail = whole.slice(-3);
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${tail}`;
}
