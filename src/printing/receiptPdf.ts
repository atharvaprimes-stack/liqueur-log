import 'regenerator-runtime/runtime';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import {
  formatBillStamp,
  formatReceiptAmount,
  formatReceiptMath,
  type ReceiptLine,
  type ReceiptPayload,
} from '../domain/billing';
import { RECEIPT_PAGE_WIDTH, receiptFileName, type ReceiptCopy } from '../domain/receiptDocument';
import { embedDocumentFont } from './pdfFont';

const MARGIN = 10;
const BLACK = rgb(0, 0, 0);

export type ReceiptPdf = {
  bytes: Uint8Array;
  fileName: string;
};

export async function buildReceiptPdf(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<ReceiptPdf> {
  const pdf = await PDFDocument.create();
  const font = await embedDocumentFont(pdf);
  const width = RECEIPT_PAGE_WIDTH - MARGIN * 2;
  const contentHeight = measure(font, receipt, copy, width);
  const page = pdf.addPage([RECEIPT_PAGE_WIDTH, contentHeight]);
  paint(page, font, receipt, copy, width, page.getHeight() - MARGIN);
  return {
    bytes: await pdf.save(),
    fileName: receiptFileName(receipt.sequence),
  };
}

function measure(font: PDFFont, receipt: ReceiptPayload, copy: ReceiptCopy, width: number): number {
  const cursor = { y: 0 };
  paint(null, font, receipt, copy, width, 0, cursor);
  return Math.max(MARGIN + -cursor.y + MARGIN, 160);
}

function paint(
  page: PDFPage | null,
  font: PDFFont,
  receipt: ReceiptPayload,
  copy: ReceiptCopy,
  width: number,
  startY: number,
  cursor: { y: number } = { y: startY },
): void {
  center(page, font, receipt.businessName.toLocaleUpperCase(), 13, width, cursor, 1);
  if (receipt.address.trim()) {
    center(page, font, receipt.address.trim(), 8, width, cursor, 1);
  }
  rule(page, font, '=', width, cursor);
  headerRow(page, font, copy.billLabel, formatBillStamp(receipt.closedAt), width, cursor, 'left', 'right', 8);
  headerRow(page, font, receipt.heading, receipt.cashierName.trim(), width, cursor, 'left', 'right', 8);
  rule(page, font, '-', width, cursor);
  paintLines(page, font, receipt.lines, copy.pcs, width, cursor);
  rule(page, font, '=', width, cursor);
  row(page, font, copy.total.toLocaleUpperCase(), formatReceiptAmount(receipt.totalAmount), 12, width, cursor, 2);
  if (receipt.isCredit) {
    row(page, font, receipt.paymentLabel, formatReceiptAmount(receipt.paidAmount), 9, width, cursor, 1);
    row(page, font, copy.credit, formatReceiptAmount(receipt.balanceAmount), 9, width, cursor, 1);
  } else {
    center(page, font, receipt.paymentLabel, 9, width, cursor, 1);
  }
  rule(page, font, '-', width, cursor);
  center(page, font, copy.thanks, 10, width, cursor, 1);
  center(page, font, copy.poweredBy, 8, width, cursor, 0);
}

function paintLines(
  page: PDFPage | null,
  font: PDFFont,
  lines: readonly ReceiptLine[],
  pcs: string,
  width: number,
  cursor: { y: number },
): void {
  for (const line of lines) {
    left(page, font, line.label, 10, width, cursor, 0);
    row(
      page,
      font,
      formatReceiptMath(line.quantity, line.unitPrice, pcs),
      formatReceiptAmount(line.lineTotal),
      9,
      width,
      cursor,
      3,
    );
  }
}

function headerRow(
  page: PDFPage | null,
  font: PDFFont,
  leftText: string,
  rightText: string,
  width: number,
  cursor: { y: number },
  leftAlign: 'left' | 'right',
  rightAlign: 'left' | 'right',
  size: number,
): void {
  const gap = 4;
  const half = (width - gap) / 2;
  const left = clipToWidth(font, leftText.trim(), size, half);
  const right = clipToWidth(font, rightText.trim(), size, half);
  if (page) {
    const leftWidth = font.widthOfTextAtSize(left, size);
    const rightWidth = font.widthOfTextAtSize(right, size);
    const leftX = leftAlign === 'right' ? MARGIN + half - leftWidth : MARGIN;
    const rightX = rightAlign === 'right' ? MARGIN + width - rightWidth : MARGIN + half + gap;
    if (left) {
      page.drawText(left, { x: leftX, y: cursor.y - size, size, font, color: BLACK });
    }
    if (right) {
      page.drawText(right, { x: rightX, y: cursor.y - size, size, font, color: BLACK });
    }
  }
  cursor.y -= step(size) + 1;
}

function clipToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (!text || font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 0 && font.widthOfTextAtSize(`${clipped}…`, size) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped ? `${clipped}…` : '';
}

function center(
  page: PDFPage | null,
  font: PDFFont,
  text: string,
  size: number,
  width: number,
  cursor: { y: number },
  gap: number,
): void {
  for (const line of wrap(font, text, size, width)) {
    if (page) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: MARGIN + (width - lineWidth) / 2,
        y: cursor.y - size,
        size,
        font,
        color: BLACK,
      });
    }
    cursor.y -= step(size);
  }
  cursor.y -= gap;
}

function left(
  page: PDFPage | null,
  font: PDFFont,
  text: string,
  size: number,
  width: number,
  cursor: { y: number },
  gap: number,
): void {
  for (const line of wrap(font, text, size, width)) {
    drawLeft(page, font, line, size, cursor);
  }
  cursor.y -= gap;
}

function row(
  page: PDFPage | null,
  font: PDFFont,
  label: string,
  amount: string,
  size: number,
  width: number,
  cursor: { y: number },
  gap: number,
): void {
  const amountWidth = font.widthOfTextAtSize(amount, size);
  const labelWidth = Math.max(width - amountWidth - 6, 24);
  const lines = wrap(font, label, size, labelWidth);
  if (page) {
    page.drawText(amount, {
      x: MARGIN + width - amountWidth,
      y: cursor.y - size,
      size,
      font,
      color: BLACK,
    });
  }
  for (const line of lines) {
    drawLeft(page, font, line, size, cursor);
  }
  cursor.y -= gap;
}

function drawLeft(page: PDFPage | null, font: PDFFont, text: string, size: number, cursor: { y: number }): void {
  if (page && text) {
    page.drawText(text, {
      x: MARGIN,
      y: cursor.y - size,
      size,
      font,
      color: BLACK,
    });
  }
  cursor.y -= step(size);
}

function rule(
  page: PDFPage | null,
  font: PDFFont,
  glyph: '-' | '=',
  width: number,
  cursor: { y: number },
): void {
  const size = 9;
  cursor.y -= 2;
  const unit = font.widthOfTextAtSize(glyph, size);
  const count = unit > 0 ? Math.max(4, Math.floor(width / unit)) : 8;
  left(page, font, glyph.repeat(count), size, width, cursor, 2);
}

function step(size: number): number {
  return size * 1.2;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const source = text.trim();
  if (!source) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const part of source.split(/(\s+)/)) {
    if (!part) {
      continue;
    }
    if (font.widthOfTextAtSize(current + part, size) <= maxWidth) {
      current += part;
      continue;
    }
    if (current.trim()) {
      lines.push(current.trimEnd());
      current = '';
    }
    const word = part.trim();
    if (!word) {
      continue;
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    for (const glyph of graphemes(word)) {
      if (font.widthOfTextAtSize(current + glyph, size) <= maxWidth) {
        current += glyph;
      } else {
        if (current) {
          lines.push(current);
        }
        current = glyph;
      }
    }
  }
  if (current.trim()) {
    lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : [''];
}

function graphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map((part) => part.segment);
  }
  return [...value];
}
