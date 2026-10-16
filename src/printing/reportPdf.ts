import 'regenerator-runtime/runtime';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { ReportSheet, SheetBand, SheetCell, SheetColumn, SheetGroup, SheetTable, SummaryPair } from '../domain/reports';
import { embedDocumentFont } from './pdfFont';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 32;
const MARGIN_TOP = 28;
const FOOTER = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const INK = rgb(0.11, 0.09, 0.08);
const MUTED = rgb(0.38, 0.34, 0.3);
const LINE = rgb(0.76, 0.72, 0.68);
const BAND = rgb(0.945, 0.925, 0.89);
const TOTAL = rgb(0.9, 0.86, 0.78);
const ACCENT = rgb(0.45, 0.28, 0.1);
const DANGER = rgb(0.62, 0.13, 0.1);

type Painter = {
  pdf: PDFDocument;
  font: PDFFont;
  page: PDFPage;
  y: number;
  sheet: ReportSheet;
};

export async function buildReportPdf(sheet: ReportSheet): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${sheet.title} · ${sheet.period}`);
  pdf.setAuthor(sheet.businessName);
  const font = await embedDocumentFont(pdf);
  const painter: Painter = {
    pdf,
    font,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
    sheet,
  };

  paintHeader(painter);
  paintSummary(painter);
  paintTable(painter, sheet.table);
  paintFootnote(painter);
  paintPageNumbers(painter);

  return {
    bytes: await pdf.save(),
    fileName: sheet.fileName,
  };
}

function paintHeader(painter: Painter): void {
  const { sheet } = painter;
  rule(painter, ACCENT, 2.5, 0);
  center(painter, sheet.businessName, 16, INK, 4);
  if (sheet.address) {
    center(painter, sheet.address, 8, MUTED, 1);
  }
  if (sheet.licenseLine) {
    center(painter, sheet.licenseLine, 8, MUTED, 1);
  }
  painter.y -= 8;
  center(painter, sheet.title, 13, INK, 2);
  center(painter, sheet.period, 11, INK, 2);
  center(painter, sheet.generated, 8, MUTED, 0);
  painter.y -= 12;
}

function paintSummary(painter: Painter): void {
  const rowHeight = 15;
  const rows = Math.max(painter.sheet.summaryLeft.length, painter.sheet.summaryRight.length);
  const height = 10 + rows * rowHeight + 6;
  ensure(painter, height);
  const top = painter.y;
  const mid = MARGIN_X + CONTENT_WIDTH / 2;
  painter.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: LINE,
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
  });
  painter.page.drawLine({
    start: { x: mid, y: top },
    end: { x: mid, y: top - height },
    thickness: 0.6,
    color: LINE,
  });
  paintPairs(painter, painter.sheet.summaryLeft, MARGIN_X, top - 8, CONTENT_WIDTH / 2, rowHeight);
  paintPairs(painter, painter.sheet.summaryRight, mid, top - 8, CONTENT_WIDTH / 2, rowHeight);
  painter.y = top - height - 8;
}

function paintPairs(
  painter: Painter,
  pairs: SummaryPair[],
  x: number,
  top: number,
  width: number,
  rowHeight: number,
): void {
  pairs.forEach((pair, index) => {
    const size = pair.strong ? 9 : 8;
    const baseline = top - index * rowHeight - rowHeight + (rowHeight - size) / 2;
    const labelWidth = width * 0.48;
    drawFitted(painter, pair.label, x + 8, baseline, size, pair.strong ? INK : MUTED, labelWidth);
    drawFitted(
      painter,
      pair.value,
      x + width - 8,
      baseline,
      size,
      INK,
      width - labelWidth - 20,
      'right',
    );
  });
}

function paintTable(painter: Painter, table: SheetTable): void {
  if (table.empty) {
    ensure(painter, 36);
    painter.y -= 8;
    left(painter, table.empty, 9, MUTED, 2);
    return;
  }

  painter.y -= 4;
  const first = table.groups[0];
  if (first) {
    ensure(painter, 18 + groupLead(painter, first));
  }
  paintColumns(painter, table.columns);
  for (const group of table.groups) {
    paintGroup(painter, table.columns, group);
  }
  if (table.extra) {
    ensure(painter, 16, () => paintColumns(painter, table.columns));
    paintCells(painter, table.columns, table.extra, 16, 8, false);
  }
  if (table.grand) {
    ensure(painter, 18, () => paintColumns(painter, table.columns));
    paintCells(painter, table.columns, table.grand, 18, 9, true);
  }
}

function groupLead(painter: Painter, group: SheetGroup): number {
  const firstBand = group.bands[0];
  return 18 + noteBlockHeight(painter, group.note) + (firstBand?.title ? 16 : 0) + 16;
}

function paintGroup(painter: Painter, columns: SheetColumn[], group: SheetGroup): void {
  const heading = () => {
    paintColumns(painter, columns);
    paintDateBand(painter, group);
  };
  const moved = ensure(painter, groupLead(painter, group), heading);
  if (!moved) {
    paintDateBand(painter, group);
  }

  for (const band of group.bands) {
    paintBandRows(painter, columns, group, band);
  }
  ensure(painter, 17, heading);
  paintCells(painter, columns, group.total, 17, 8, true);
}

function paintDateBand(painter: Painter, group: SheetGroup): void {
  paintBand(painter, group.title, 18, BAND, 9, INK, true);
  if (group.note) {
    paintNote(painter, group.note);
  }
}

function paintBandRows(painter: Painter, columns: SheetColumn[], group: SheetGroup, band: SheetBand): void {
  const resume = () => {
    paintColumns(painter, columns);
    paintDateBand(painter, group);
    if (band.title) {
      paintBand(painter, band.title, 16, rgb(0.975, 0.965, 0.95), 8, INK, false);
    }
  };
  if (band.title) {
    const moved = ensure(painter, 16 + 16, resume);
    if (!moved) {
      paintBand(painter, band.title, 16, rgb(0.975, 0.965, 0.95), 8, INK, false);
    }
  }
  for (const row of band.rows) {
    ensure(painter, 16, resume);
    paintCells(painter, columns, row, 16, 8, false);
  }
}

function noteBlockHeight(painter: Painter, note: string | null): number {
  if (!note) {
    return 0;
  }
  return wrap(painter.font, note, 8, CONTENT_WIDTH - 16).length * 11 + 3;
}

function paintNote(painter: Painter, text: string): void {
  const size = 8;
  const lines = wrap(painter.font, text, size, CONTENT_WIDTH - 16);
  for (const line of lines) {
    painter.page.drawText(line, {
      x: MARGIN_X + 8,
      y: painter.y - size - 1,
      size,
      font: painter.font,
      color: MUTED,
    });
    painter.y -= 11;
  }
  painter.y -= 3;
}

function paintColumns(painter: Painter, columns: SheetColumn[]): void {
  const height = 18;
  ensure(painter, height);
  const top = painter.y;
  painter.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: BAND,
  });
  let x = MARGIN_X;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    const size = 8;
    const baseline = top - (height + size) / 2;
    drawFitted(
      painter,
      column.text,
      column.align === 'right' ? x + width - 4 : x + 4,
      baseline,
      size,
      MUTED,
      width - 8,
      column.align,
    );
    x += width;
  }
  painter.y = top - height;
}

function paintBand(
  painter: Painter,
  text: string,
  height: number,
  fill: ReturnType<typeof rgb>,
  size: number,
  color: ReturnType<typeof rgb>,
  accent: boolean,
): void {
  const top = painter.y;
  painter.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: fill,
  });
  if (accent) {
    painter.page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: 3,
      height,
      color: ACCENT,
    });
  }
  drawFitted(painter, text, MARGIN_X + 8, top - (height + size) / 2, size, color, CONTENT_WIDTH - 16, 'left');
  painter.y = top - height;
}

function paintCells(
  painter: Painter,
  columns: SheetColumn[],
  cells: SheetCell[],
  height: number,
  size: number,
  total: boolean,
): void {
  const top = painter.y;
  if (total) {
    painter.page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: TOTAL,
    });
  }
  painter.page.drawLine({
    start: { x: MARGIN_X, y: top - height },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: top - height },
    thickness: total ? 0.7 : 0.3,
    color: LINE,
  });
  let x = MARGIN_X;
  columns.forEach((column, index) => {
    const width = CONTENT_WIDTH * column.width;
    const cell = cells[index] ?? { text: '' };
    const color = cell.tone === 'danger' ? DANGER : cell.tone === 'muted' ? MUTED : INK;
    drawFitted(
      painter,
      cell.text,
      column.align === 'right' ? x + width - 4 : x + 4,
      top - (height + size) / 2,
      size,
      color,
      width - 8,
      column.align,
    );
    x += width;
  });
  painter.y = top - height;
}

function paintFootnote(painter: Painter): void {
  const size = 8;
  const lines = wrap(painter.font, painter.sheet.footnote, size, CONTENT_WIDTH);
  const height = lines.length * 11 + 14;
  ensure(painter, height);
  painter.y -= 12;
  for (const line of lines) {
    left(painter, line, size, MUTED, 1);
  }
}

function paintPageNumbers(painter: Painter): void {
  const pages = painter.pdf.getPages();
  const total = pages.length;
  pages.forEach((page, index) => {
    const label = `${index + 1} / ${total}`;
    const size = 8;
    const width = painter.font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - width,
      y: 16,
      size,
      font: painter.font,
      color: MUTED,
    });
  });
}

function ensure(painter: Painter, height: number, resume?: () => void): boolean {
  if (painter.y - height >= FOOTER) {
    return false;
  }
  painter.page = painter.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  painter.y = PAGE_HEIGHT - MARGIN_TOP;
  const size = 9;
  const periodWidth = painter.font.widthOfTextAtSize(painter.sheet.period, 8);
  drawFitted(painter, painter.sheet.businessName, MARGIN_X, painter.y - size, size, INK, CONTENT_WIDTH - periodWidth - 12, 'left');
  drawFitted(
    painter,
    painter.sheet.period,
    PAGE_WIDTH - MARGIN_X,
    painter.y - 8,
    8,
    MUTED,
    periodWidth + 4,
    'right',
  );
  painter.y -= 16;
  left(painter, painter.sheet.continued, 8, MUTED, 2);
  rule(painter, LINE, 0.6, 6);
  resume?.();
  return true;
}

function center(painter: Painter, text: string, size: number, color: ReturnType<typeof rgb>, gap: number): void {
  for (const line of wrap(painter.font, text, size, CONTENT_WIDTH)) {
    const width = painter.font.widthOfTextAtSize(line, size);
    painter.page.drawText(line, {
      x: MARGIN_X + (CONTENT_WIDTH - width) / 2,
      y: painter.y - size,
      size,
      font: painter.font,
      color,
    });
    painter.y -= size * 1.25;
  }
  painter.y -= gap;
}

function left(painter: Painter, text: string, size: number, color: ReturnType<typeof rgb>, gap: number): void {
  painter.page.drawText(text, {
    x: MARGIN_X,
    y: painter.y - size,
    size,
    font: painter.font,
    color,
  });
  painter.y -= size * 1.25 + gap;
}

function rule(painter: Painter, color: ReturnType<typeof rgb>, thickness: number, gap: number): void {
  painter.page.drawLine({
    start: { x: MARGIN_X, y: painter.y },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: painter.y },
    thickness,
    color,
  });
  painter.y -= thickness + gap;
}

function drawFitted(
  painter: Painter,
  text: string,
  x: number,
  baseline: number,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
  align: 'left' | 'right' = 'left',
): void {
  const fitted = fit(painter.font, text, size, maxWidth);
  if (!fitted) {
    return;
  }
  const width = painter.font.widthOfTextAtSize(fitted, size);
  painter.page.drawText(fitted, {
    x: align === 'right' ? x - width : x,
    y: baseline,
    size,
    font: painter.font,
    color,
  });
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value || font.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }
  const glyphs = graphemes(value);
  let best = 0;
  let low = 0;
  let high = glyphs.length;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${glyphs.slice(0, mid).join('')}…`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best > 0 ? `${glyphs.slice(0, best).join('')}…` : '…';
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) {
    return [];
  }
  const lines: string[] = [];
  let current = '';
  for (const part of source.split(' ')) {
    const next = current ? `${current} ${part}` : part;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    if (font.widthOfTextAtSize(part, size) <= maxWidth) {
      current = part;
      continue;
    }
    current = '';
    for (const glyph of graphemes(part)) {
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
  if (current) {
    lines.push(current);
  }
  return lines;
}

function graphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map((part) => part.segment);
  }
  return [...value];
}
