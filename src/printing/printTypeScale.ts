import type { PrintFontSize } from './printFontSize';
import type { PrintPaperWidth } from './printPaperWidth';
import {
  previewWidthDp,
  THERMAL_PAPER_DOTS_58,
  THERMAL_PAPER_DOTS_80,
  THERMAL_QR_DOTS,
} from './thermalConstants';
import { RECEIPT_QR_SIZE } from './receiptQr';

/** On-screen preview width (58mm at 160 dp/in). Unchanged for cart/payment UI. */
export const PREVIEW_WIDTH_DP = previewWidthDp(58);

export type TypeScale = {
  business: string;
  address: string;
  meta: string;
  section: string;
  line: string;
  amount: string;
  total: string;
  scanPay: string;
  thanks: string;
  powered: string;
  rule: string;
  dashLen: number;
  qr: number;
  width: number;
};

export const PREVIEW_TYPE: TypeScale = {
  business: 'text-[15px] font-bold',
  address: 'text-[9px]',
  meta: 'text-[9px]',
  section: 'text-[8px] font-semibold',
  line: 'text-[11px]',
  amount: 'text-[11px]',
  total: 'text-[13px] font-bold',
  scanPay: 'text-[11px] font-bold',
  thanks: 'text-[11px] font-bold',
  powered: 'text-[10px]',
  rule: 'text-[11px]',
  dashLen: 48,
  qr: RECEIPT_QR_SIZE,
  width: PREVIEW_WIDTH_DP,
};

/**
 * 58mm billing hierarchy — values must stay identical to the pre-80mm release
 * so existing printers and Small/Medium/Large settings do not shift.
 */
const PRINT_58_SMALL: TypeScale = {
  business: 'text-[24px] font-bold',
  address: 'text-[14px]',
  meta: 'text-[14px]',
  section: 'text-[13px] font-semibold',
  line: 'text-[17px]',
  amount: 'text-[17px]',
  total: 'text-[20px] font-bold',
  scanPay: 'text-[15px] font-bold',
  thanks: 'text-[15px] font-bold',
  powered: 'text-[13px]',
  rule: 'text-[14px]',
  dashLen: 32,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_58,
};

const PRINT_58_MEDIUM: TypeScale = {
  business: 'text-[28px] font-bold',
  address: 'text-[16px]',
  meta: 'text-[16px]',
  section: 'text-[15px] font-semibold',
  line: 'text-[20px]',
  amount: 'text-[20px]',
  total: 'text-[24px] font-bold',
  scanPay: 'text-[17px] font-bold',
  thanks: 'text-[17px] font-bold',
  powered: 'text-[15px]',
  rule: 'text-[15px]',
  dashLen: 28,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_58,
};

const PRINT_58_LARGE: TypeScale = {
  business: 'text-[32px] font-bold',
  address: 'text-[18px]',
  meta: 'text-[18px]',
  section: 'text-[16px] font-semibold',
  line: 'text-[23px]',
  amount: 'text-[23px]',
  total: 'text-[28px] font-bold',
  scanPay: 'text-[19px] font-bold',
  thanks: 'text-[19px] font-bold',
  powered: 'text-[16px]',
  rule: 'text-[16px]',
  dashLen: 24,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_58,
};

/** 80mm: roomier body text; QR stays THERMAL_QR_DOTS (same physical scan size). */
const PRINT_80_SMALL: TypeScale = {
  business: 'text-[28px] font-bold',
  address: 'text-[16px]',
  meta: 'text-[16px]',
  section: 'text-[14px] font-semibold',
  line: 'text-[20px]',
  amount: 'text-[20px]',
  total: 'text-[24px] font-bold',
  scanPay: 'text-[17px] font-bold',
  thanks: 'text-[17px] font-bold',
  powered: 'text-[15px]',
  rule: 'text-[15px]',
  dashLen: 48,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_80,
};

const PRINT_80_MEDIUM: TypeScale = {
  business: 'text-[32px] font-bold',
  address: 'text-[18px]',
  meta: 'text-[18px]',
  section: 'text-[16px] font-semibold',
  line: 'text-[23px]',
  amount: 'text-[23px]',
  total: 'text-[28px] font-bold',
  scanPay: 'text-[19px] font-bold',
  thanks: 'text-[19px] font-bold',
  powered: 'text-[16px]',
  rule: 'text-[16px]',
  dashLen: 42,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_80,
};

const PRINT_80_LARGE: TypeScale = {
  business: 'text-[36px] font-bold',
  address: 'text-[20px]',
  meta: 'text-[20px]',
  section: 'text-[17px] font-semibold',
  line: 'text-[26px]',
  amount: 'text-[26px]',
  total: 'text-[32px] font-bold',
  scanPay: 'text-[21px] font-bold',
  thanks: 'text-[21px] font-bold',
  powered: 'text-[18px]',
  rule: 'text-[18px]',
  dashLen: 36,
  qr: THERMAL_QR_DOTS,
  width: THERMAL_PAPER_DOTS_80,
};

const PRINT_SCALES: Record<PrintPaperWidth, Record<PrintFontSize, TypeScale>> = {
  58: {
    small: PRINT_58_SMALL,
    medium: PRINT_58_MEDIUM,
    large: PRINT_58_LARGE,
  },
  80: {
    small: PRINT_80_SMALL,
    medium: PRINT_80_MEDIUM,
    large: PRINT_80_LARGE,
  },
};

export function printTypeScale(
  size: PrintFontSize,
  paper: PrintPaperWidth = 58,
): TypeScale {
  return PRINT_SCALES[paper][size];
}
