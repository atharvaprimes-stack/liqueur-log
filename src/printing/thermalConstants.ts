import type { PrintPaperWidth } from './printPaperWidth';

/** ~203 dpi ESC/POS heads (standard for 58mm / 80mm billing printers). */
export const THERMAL_DPI = 203;

/** 58mm printable width in dots — do not change; current capture/print depends on this. */
export const THERMAL_PAPER_DOTS_58 = 384;

/** 80mm printable width in dots at ~203 dpi. */
export const THERMAL_PAPER_DOTS_80 = 576;

/**
 * QR bitmap width in dots. Same physical size on both papers (~40mm) so scan
 * reliability stays consistent; 80mm gains side margin instead of a larger QR.
 */
export const THERMAL_QR_DOTS = 320;

/** @deprecated Prefer thermalPaperDots(58). Kept for call sites that assume 58mm. */
export const THERMAL_PAPER_DOTS = THERMAL_PAPER_DOTS_58;

export function thermalPaperDots(paper: PrintPaperWidth): number {
  return paper === 80 ? THERMAL_PAPER_DOTS_80 : THERMAL_PAPER_DOTS_58;
}

export function thermalQrDots(_paper: PrintPaperWidth = 58): number {
  return THERMAL_QR_DOTS;
}

export function previewWidthDp(paper: PrintPaperWidth = 58): number {
  return Math.round((paper / 25.4) * 160);
}
