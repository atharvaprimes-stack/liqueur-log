import {
  formatBillStamp,
  formatReceiptAmount,
  formatReceiptMath,
  groupReceiptLinesByStation,
  type ReceiptLine,
  type ReceiptPayload,
} from './billing';

/** 58mm at 72 points per inch. */
export const RECEIPT_PAGE_WIDTH = 164;

/** Keep in sync with `RECEIPT_QR_SIZE` in printing/receiptQr. */
const RECEIPT_QR_BLOCK = 108;

const DASH = '-'.repeat(48);
const EQUALS = '='.repeat(48);

export type ReceiptCopy = {
  thanks: string;
  poweredBy: string;
  scanPay: string;
  billLabel: string;
  cashier: string;
  subtotal: string;
  roundOff: string;
  total: string;
  credit: string;
  pcs: string;
  bar: string;
  kitchen: string;
};

export type ReceiptDocument = {
  html: string;
  width: number;
  height: number;
  fileName: string;
};

export function receiptFileName(sequence: string): string {
  return `${sequence.replace(/[^\d-]/g, '') || 'bill'}.pdf`;
}

export function buildReceiptDocument(
  receipt: ReceiptPayload,
  copy: ReceiptCopy,
  qrDataUri: string,
): ReceiptDocument {
  const height = pageHeight(receipt, copy);
  const heightMm = ((height / 72) * 25.4).toFixed(2);
  const fileName = receiptFileName(receipt.sequence);
  const sections = groupReceiptLinesByStation(receipt.lines);
  const items = [
    ...sectionBlocks(copy.bar, sections.bar, copy.pcs),
    ...sectionBlocks(copy.kitchen, sections.kitchen, copy.pcs),
  ].join('');
  const payment = receipt.isCredit
    ? `${amountRow(receipt.paymentLabel, receipt.paidAmount)}
      ${amountRow(copy.credit, receipt.balanceAmount)}`
    : `<div class="meta">${escapeHtml(receipt.paymentLabel)}</div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 58mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 58mm;
      background: #ffffff;
      color: #000000;
    }
    body {
      font-family: "Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", sans-serif;
    }
    .sheet {
      width: 58mm;
      max-width: 58mm;
      overflow: hidden;
      padding: 2mm 2mm 4mm;
      font-size: 11px;
      line-height: 1.25;
    }
    .shop {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      text-transform: uppercase;
    }
    .address {
      margin-top: 2px;
      font-size: 9px;
      line-height: 1.2;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta, .thanks, .powered {
      margin-top: 2px;
      font-size: 11px;
      line-height: 1.25;
      text-align: center;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 4px;
      margin-top: 2px;
      font-size: 9px;
      line-height: 1.25;
    }
    .header-row .cell {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .header-row .bill {
      font-weight: 700;
    }
    .left { text-align: left; }
    .right { text-align: right; }
    .rule {
      margin: 4px 0;
      overflow: hidden;
      font-family: "Courier New", "Nimbus Mono", monospace;
      font-size: 11px;
      line-height: 1.1;
      white-space: nowrap;
    }
    .section {
      margin-top: 5px;
      margin-bottom: 1px;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.08em;
      line-height: 1.2;
      text-align: center;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .item { margin-top: 6px; }
    .name {
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
      text-align: left;
    }
    .pair {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      font-size: 11px;
      line-height: 1.25;
    }
    .pair .label { text-transform: uppercase; }
    .amt {
      flex-shrink: 0;
      text-align: right;
      white-space: nowrap;
    }
    .grand {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.25;
    }
    .scan {
      margin: 6px 0;
      text-align: center;
    }
    .scan-label {
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .scan-frame {
      display: inline-block;
      padding: 4px;
      border: 1px solid #000000;
      background: #ffffff;
      line-height: 0;
    }
    .scan-frame img {
      width: ${RECEIPT_QR_BLOCK}px;
      height: ${RECEIPT_QR_BLOCK}px;
      object-fit: contain;
    }
    .thanks {
      font-weight: 700;
    }
    .powered {
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="shop">${escapeHtml(receipt.businessName)}</div>
    ${receipt.address.trim() ? `<div class="address">${escapeHtml(receipt.address.trim())}</div>` : ''}
    <div class="rule">${EQUALS}</div>
    <div class="header-row">
      <div class="cell bill left">${escapeHtml(copy.billLabel)}</div>
      <div class="cell right">${escapeHtml(formatBillStamp(receipt.closedAt))}</div>
    </div>
    <div class="header-row">
      <div class="cell left">${escapeHtml(receipt.heading)}</div>
      <div class="cell right">${escapeHtml(receipt.cashierName.trim())}</div>
    </div>
    <div class="rule">${DASH}</div>
    ${items}
    <div class="rule">${DASH}</div>
    ${amountRow(copy.subtotal, receipt.subtotal)}
    ${amountRow(copy.roundOff, receipt.roundOff)}
    <div class="rule">${EQUALS}</div>
    ${amountRow(copy.total, receipt.totalAmount, true)}
    ${payment}
    <div class="rule">${DASH}</div>
    <div class="scan">
      <div class="scan-label">${escapeHtml(copy.scanPay)}</div>
      <div class="scan-frame"><img src="${qrDataUri}" alt="${escapeHtml(copy.scanPay)}" /></div>
    </div>
    <div class="rule">${DASH}</div>
    <div class="thanks">${escapeHtml(copy.thanks)}</div>
    <div class="powered">${escapeHtml(copy.poweredBy)}</div>
  </div>
</body>
</html>`;

  return { html, width: RECEIPT_PAGE_WIDTH, height, fileName };
}

function sectionBlocks(title: string, lines: ReceiptLine[], pcs: string): string[] {
  if (lines.length === 0) {
    return [];
  }
  return [
    `<div class="section">· ${escapeHtml(title)} ·</div>`,
    ...lines.map((line) => itemBlock(line, pcs)),
  ];
}

function itemBlock(line: ReceiptLine, pcs: string): string {
  return `<div class="item">
    <div class="name">${escapeHtml(line.label)}</div>
    <div class="pair">
      <span>${escapeHtml(formatReceiptMath(line.quantity, line.unitPrice, pcs))}</span>
      <span class="amt">${escapeHtml(formatReceiptAmount(line.lineTotal))}</span>
    </div>
  </div>`;
}

function amountRow(label: string, amount: number, grand = false): string {
  return `<div class="pair${grand ? ' grand' : ''}">
    <span class="label">${escapeHtml(label)}</span>
    <span class="amt">${escapeHtml(formatReceiptAmount(amount))}</span>
  </div>`;
}

function pageHeight(receipt: ReceiptPayload, copy: ReceiptCopy): number {
  const sections = groupReceiptLinesByStation(receipt.lines);
  let height = 28 + wrappedLines(receipt.businessName, 16) * 18;
  if (receipt.address.trim()) {
    height += 12;
  }
  height += 12 + 12 + 12;
  height += 12;
  if (sections.bar.length > 0) {
    height += 16;
  }
  if (sections.kitchen.length > 0) {
    height += 16;
  }
  for (const line of receipt.lines) {
    height += 6 + wrappedLines(line.label, 24) * 14 + 14;
  }
  height += 12 + 14 * 3 + 12 + 18;
  height += receipt.isCredit ? 28 : 14;
  height += 12 + 18 + RECEIPT_QR_BLOCK + 16;
  height += 12 + wrappedLines(copy.thanks, 22) * 16 + wrappedLines(copy.poweredBy, 24) * 14 + 24;
  return Math.max(height, 240);
}

function wrappedLines(value: string, perLine: number): number {
  const text = value.trim();
  if (!text) {
    return 1;
  }
  return Math.max(1, Math.ceil([...text].length / perLine));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
