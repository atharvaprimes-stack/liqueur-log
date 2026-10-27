/**
 * Guards 58mm thermal layout against regressions when 80mm support is present.
 * Run: node scripts/verify-print-paper.mjs
 */

import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Source is TypeScript — assert the frozen 58mm contract via a lightweight mirror
// of the published constants (must match src/printing/*).
const THERMAL_PAPER_DOTS_58 = 384;
const THERMAL_PAPER_DOTS_80 = 576;
const THERMAL_QR_DOTS = 320;
const PREVIEW_WIDTH_DP = Math.round((58 / 25.4) * 160);

const PRINT_58 = {
  small: {
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
  },
  medium: {
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
  },
  large: {
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
  },
};

async function readSource(rel) {
  const { readFile } = await import('node:fs/promises');
  return readFile(join(root, rel), 'utf8');
}

function mustInclude(source, snippet, label) {
  assert.ok(source.includes(snippet), `${label}: missing ${JSON.stringify(snippet)}`);
}

const typeScale = await readSource('src/printing/printTypeScale.ts');
const constants = await readSource('src/printing/thermalConstants.ts');
const paperPref = await readSource('src/printing/printPaperWidth.ts');
const thermalPrint = await readSource('src/printing/thermalPrint.native.ts');
const capture = await readSource('src/printing/ReceiptCaptureHost.native.tsx');
const nodes = await readSource('src/printing/thermalNodes.ts');
const receiptDoc = await readSource('src/domain/receiptDocument.ts');
const receiptPdf = await readSource('src/printing/receiptPdf.ts');

// Constants
mustInclude(constants, 'THERMAL_PAPER_DOTS_58 = 384', '58 dots');
mustInclude(constants, 'THERMAL_PAPER_DOTS_80 = 576', '80 dots');
mustInclude(constants, 'THERMAL_QR_DOTS = 320', 'QR dots');
mustInclude(constants, 'export const THERMAL_PAPER_DOTS = THERMAL_PAPER_DOTS_58', 'compat alias');

// Default paper preference is 58
mustInclude(paperPref, 'return 58', 'default paper');
mustInclude(paperPref, "thermal.paperWidthMm.v1", 'paper pref key');

// 58mm type scales frozen
for (const [size, scale] of Object.entries(PRINT_58)) {
  for (const [key, value] of Object.entries(scale)) {
    if (typeof value === 'string') {
      mustInclude(typeScale, value, `58 ${size}.${key}`);
    } else if (key === 'dashLen') {
      // dashLen appears in both papers; ensure 58 block still has these lengths
      mustInclude(typeScale, `dashLen: ${value}`, `58 ${size}.dashLen`);
    }
  }
  mustInclude(typeScale, 'width: THERMAL_PAPER_DOTS_58', `58 ${size} width`);
}

mustInclude(typeScale, 'width: THERMAL_PAPER_DOTS_80', '80 width');
mustInclude(typeScale, 'PRINT_80_SMALL', '80 scales exist');
mustInclude(typeScale, 'previewWidthDp(58)', 'preview width from 58mm');
mustInclude(typeScale, 'width: PREVIEW_WIDTH_DP', 'preview uses PREVIEW_WIDTH_DP');
assert.equal(PREVIEW_WIDTH_DP, 365);

// Print path wires preference
mustInclude(thermalPrint, 'getPrintPaperWidth', 'thermal print paper');
mustInclude(thermalPrint, 'paperWidthMm: paper', 'driver option');
mustInclude(capture, 'getPrintPaperWidth', 'capture paper');
mustInclude(capture, 'thermalPaperDots', 'capture width');
mustInclude(nodes, 'thermalPaperDots(paper)', 'image width');

// Share/PDF stay 58mm compact (no accidental 80mm page)
mustInclude(receiptDoc, 'size: 58mm', 'html page 58');
mustInclude(receiptDoc, 'RECEIPT_PAGE_WIDTH = 164', 'pdf width 58');
mustInclude(receiptPdf, 'RECEIPT_PAGE_WIDTH', 'pdf uses receipt width');

assert.equal(THERMAL_PAPER_DOTS_58, 384);
assert.equal(THERMAL_PAPER_DOTS_80, 576);
assert.equal(THERMAL_QR_DOTS, 320);

console.log('verify-print-paper: OK (58mm contract intact, 80mm wired)');
