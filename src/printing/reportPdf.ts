import 'regenerator-runtime/runtime';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { ReportSheet, SheetBand, SheetCell, SheetColumn, SheetGroup, SheetTable, SummaryPair } from '../domain/reports';
import { embedDocumentFont } from './pdfFont';

/** ISO A4 in PDF points (210mm × 297mm). */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
/** ~15mm side / top margins — standard for printable A4 reports. */
const MARGIN_X = 42;
const MARGIN_TOP = 40;
const FOOTER = 36;
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
  if (sheet.summaryLeft.length > 0 || sheet.summaryRight.length > 0) {
    paintSummary(painter);
  }
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
  const hasMeta = Boolean(sheet.title || sheet.period || sheet.generated);
  if (hasMeta) {
    painter.y -= 8;
    if (sheet.title) {
      center(painter, sheet.title, 13, INK, 2);
    }
    if (sheet.period) {
      center(painter, sheet.period, 11, INK, 2);
    }
    if (sheet.generated) {
      center(painter, sheet.generated, 8, MUTED, 0);
    }
  }
  painter.y -= hasMeta ? 12 : 10;
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

  if ((table.flowColumns ?? 1) > 1) {
    paintFlowTable(painter, table);
    return;
  }

  const scale = tableTypeScale(table);
  painter.y -= 4;
  const first = table.groups[0];
  if (first) {
    ensure(painter, 18 * scale + groupLead(painter, first, scale));
  }
  const sectionFirst = Boolean(table.sectionPerGroup);
  const needsLeadingColumns =
    !sectionFirst || table.groups.every((group) => !group.title.trim());
  if (needsLeadingColumns) {
    paintColumns(painter, table.columns, scale);
  }
  for (const group of table.groups) {
    paintGroup(painter, table.columns, group, sectionFirst, scale);
  }
  if (table.extra) {
    ensure(painter, 16 * scale, () => paintColumns(painter, table.columns, scale));
    paintCells(painter, table.columns, table.extra, 16 * scale, 8 * scale, false);
  }
  if (table.grand) {
    ensure(painter, 18 * scale, () => paintColumns(painter, table.columns, scale));
    paintCells(painter, table.columns, table.grand, 18 * scale, 9 * scale, true);
  }
}

function tableTypeScale(table: SheetTable): number {
  return Math.max(1, table.typeScale ?? 1);
}

const FLOW_GAP = 10;

type FlowMetrics = {
  row: number;
  header: number;
  headerSize: number;
  itemSize: number;
  bandSize: number;
  bandHeight: number;
};

function flowMetrics(table: SheetTable): FlowMetrics {
  const scale = tableTypeScale(table);
  return {
    row: 16 * scale,
    header: 18 * scale,
    headerSize: 7.5 * scale,
    itemSize: 8 * scale,
    bandSize: 8 * scale,
    bandHeight: 16 * scale,
  };
}

/** Side-by-side strips on A4. Default fill is row-wise (left→right, then next line). */
function paintFlowTable(painter: Painter, table: SheetTable): void {
  const flowColumns = Math.max(2, table.flowColumns ?? 2);
  const fill = table.flowFill ?? 'row';
  const metrics = flowMetrics(table);
  const strip = table.columns;
  painter.y -= 4;

  for (const group of table.groups) {
    if (group.breakBefore) {
      forceNewPage(painter, false);
    }

    const paintGroupChrome = (continued: boolean) => {
      if (group.title) {
        const label = continued ? `${group.title} (${painter.sheet.continued})` : group.title;
        paintBand(painter, label, metrics.bandHeight + 2, BAND, metrics.bandSize + 1, INK, true);
      }
      if (group.note) {
        paintNote(painter, group.note);
      }
      paintFlowHeaders(painter, strip, flowColumns, metrics);
    };

    let chromeReady = false;
    const ensureChrome = () => {
      if (!chromeReady) {
        paintGroupChrome(false);
        chromeReady = true;
      }
    };

    for (const band of group.bands) {
      const ensureBandChrome = () => {
        ensureChrome();
        if (band.title) {
          paintBand(
            painter,
            band.title,
            metrics.bandHeight,
            rgb(0.975, 0.965, 0.95),
            metrics.bandSize,
            INK,
            false,
          );
        }
      };

      const moved = ensure(
        painter,
        metrics.bandHeight + metrics.header + metrics.row + (band.title ? metrics.bandHeight : 0),
        () => {
          paintGroupChrome(true);
          if (band.title) {
            paintBand(
              painter,
              band.title,
              metrics.bandHeight,
              rgb(0.975, 0.965, 0.95),
              metrics.bandSize,
              INK,
              false,
            );
          }
        },
      );
      if (!moved) {
        ensureBandChrome();
      } else {
        chromeReady = true;
      }

      if (fill === 'row') {
        paintFlowRowsRowWise(painter, strip, flowColumns, metrics, band.rows, () => {
          forceNewPage(painter, true);
          paintGroupChrome(true);
          if (band.title) {
            paintBand(
              painter,
              band.title,
              metrics.bandHeight,
              rgb(0.975, 0.965, 0.95),
              metrics.bandSize,
              INK,
              false,
            );
          }
        });
      } else {
        paintFlowRowsColumnWise(painter, strip, flowColumns, metrics, band.rows, () => {
          forceNewPage(painter, true);
          paintGroupChrome(true);
          if (band.title) {
            paintBand(
              painter,
              band.title,
              metrics.bandHeight,
              rgb(0.975, 0.965, 0.95),
              metrics.bandSize,
              INK,
              false,
            );
          }
        });
      }
    }

    painter.y -= 4;
  }
}

function paintFlowRowsRowWise(
  painter: Painter,
  strip: SheetColumn[],
  flowColumns: number,
  metrics: FlowMetrics,
  items: SheetCell[][],
  onNewPage: () => void,
): void {
  for (let index = 0; index < items.length; index += flowColumns) {
    if (painter.y - metrics.row < FOOTER) {
      onNewPage();
    }
    const top = painter.y;
    for (let columnIndex = 0; columnIndex < flowColumns; columnIndex += 1) {
      const item = items[index + columnIndex];
      if (item) {
        paintFlowItem(painter, strip, flowColumns, columnIndex, top, item, metrics);
      }
    }
    painter.y = top - metrics.row;
  }
}

function paintFlowRowsColumnWise(
  painter: Painter,
  strip: SheetColumn[],
  flowColumns: number,
  metrics: FlowMetrics,
  items: SheetCell[][],
  onNewPage: () => void,
): void {
  let columnIndex = 0;
  let columnTop = painter.y;
  let y = painter.y;
  let lowestY = painter.y;

  for (const item of items) {
    if (y - metrics.row < FOOTER) {
      if (columnIndex + 1 < flowColumns) {
        columnIndex += 1;
        y = columnTop;
      } else {
        onNewPage();
        columnIndex = 0;
        columnTop = painter.y;
        y = painter.y;
        lowestY = painter.y;
      }
    }

    paintFlowItem(painter, strip, flowColumns, columnIndex, y, item, metrics);
    y -= metrics.row;
    if (y < lowestY) {
      lowestY = y;
    }
  }

  painter.y = lowestY;
}

function paintFlowHeaders(
  painter: Painter,
  strip: SheetColumn[],
  flowColumns: number,
  metrics: FlowMetrics,
): void {
  const top = painter.y;
  const stripWidth = (CONTENT_WIDTH - FLOW_GAP * (flowColumns - 1)) / flowColumns;
  painter.page.drawRectangle({
    x: MARGIN_X,
    y: top - metrics.header,
    width: CONTENT_WIDTH,
    height: metrics.header,
    color: BAND,
  });

  for (let columnIndex = 0; columnIndex < flowColumns; columnIndex += 1) {
    const originX = MARGIN_X + columnIndex * (stripWidth + FLOW_GAP);
    let x = originX;
    strip.forEach((column, index) => {
      const width = stripWidth * column.width;
      const size = metrics.headerSize;
      const baseline = top - (metrics.header + size) / 2;
      if (index > 0) {
        painter.page.drawLine({
          start: { x, y: top },
          end: { x, y: top - metrics.header },
          thickness: 0.35,
          color: LINE,
        });
      }
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
    });
    if (columnIndex > 0) {
      const gutterX = originX - FLOW_GAP / 2;
      painter.page.drawLine({
        start: { x: gutterX, y: top },
        end: { x: gutterX, y: top - metrics.header },
        thickness: 0.6,
        color: LINE,
      });
    }
  }

  painter.page.drawLine({
    start: { x: MARGIN_X, y: top - metrics.header },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: top - metrics.header },
    thickness: 0.7,
    color: LINE,
  });
  painter.y = top - metrics.header;
}

function paintFlowItem(
  painter: Painter,
  strip: SheetColumn[],
  flowColumns: number,
  columnIndex: number,
  top: number,
  cells: SheetCell[],
  metrics: FlowMetrics,
): void {
  const stripWidth = (CONTENT_WIDTH - FLOW_GAP * (flowColumns - 1)) / flowColumns;
  const originX = MARGIN_X + columnIndex * (stripWidth + FLOW_GAP);
  painter.page.drawLine({
    start: { x: originX, y: top - metrics.row },
    end: { x: originX + stripWidth, y: top - metrics.row },
    thickness: 0.3,
    color: LINE,
  });

  let x = originX;
  strip.forEach((column, index) => {
    const width = stripWidth * column.width;
    const cell = cells[index] ?? { text: '' };
    const size = metrics.itemSize;
    if (index > 0) {
      painter.page.drawLine({
        start: { x, y: top },
        end: { x, y: top - metrics.row },
        thickness: 0.25,
        color: LINE,
      });
    }
    drawFitted(
      painter,
      cell.text,
      column.align === 'right' ? x + width - 4 : x + 4,
      top - (metrics.row + size) / 2,
      size,
      INK,
      width - 8,
      column.align,
    );
    x += width;
  });
}

function groupLead(painter: Painter, group: SheetGroup, scale = 1): number {
  const firstBand = group.bands[0];
  const heading = group.title || group.note ? 18 * scale + noteBlockHeight(painter, group.note) : 0;
  return heading + (firstBand?.title ? 16 * scale : 0) + 16 * scale;
}

function paintGroup(
  painter: Painter,
  columns: SheetColumn[],
  group: SheetGroup,
  sectionFirst = false,
  scale = 1,
): void {
  const hasTitle = Boolean(group.title.trim());
  const heading = () => {
    if (!hasTitle) {
      paintColumns(painter, columns, scale);
      return;
    }
    if (sectionFirst) {
      paintDateBand(painter, group, scale);
      paintColumns(painter, columns, scale);
    } else {
      paintColumns(painter, columns, scale);
      paintDateBand(painter, group, scale);
    }
  };
  if (group.breakBefore) {
    forceNewPage(painter, false);
    heading();
  } else if (hasTitle) {
    const moved = ensure(painter, groupLead(painter, group, scale), heading);
    if (!moved) {
      if (sectionFirst) {
        paintDateBand(painter, group, scale);
        paintColumns(painter, columns, scale);
      } else {
        paintDateBand(painter, group, scale);
      }
    }
  }

  for (const band of group.bands) {
    paintBandRows(painter, columns, group, band, sectionFirst, scale);
  }
  if (group.total) {
    ensure(painter, 17 * scale, heading);
    paintCells(painter, columns, group.total, 17 * scale, 8 * scale, true);
  }
}

function paintDateBand(painter: Painter, group: SheetGroup, scale = 1): void {
  if (group.title) {
    paintBand(painter, group.title, 18 * scale, BAND, 9 * scale, INK, true);
  }
  if (group.note) {
    paintNote(painter, group.note);
  }
}

function paintBandRows(
  painter: Painter,
  columns: SheetColumn[],
  group: SheetGroup,
  band: SheetBand,
  sectionFirst = false,
  scale = 1,
): void {
  const resume = () => {
    if (sectionFirst) {
      paintDateBand(painter, group, scale);
      paintColumns(painter, columns, scale);
    } else {
      paintColumns(painter, columns, scale);
      paintDateBand(painter, group, scale);
    }
    if (band.title) {
      paintBand(painter, band.title, 16 * scale, rgb(0.975, 0.965, 0.95), 8 * scale, INK, false);
    }
  };
  if (band.title) {
    const moved = ensure(painter, 16 * scale + 16 * scale, resume);
    if (!moved) {
      paintBand(painter, band.title, 16 * scale, rgb(0.975, 0.965, 0.95), 8 * scale, INK, false);
    }
  }
  let mergeLabel = '';
  let mergeLeft = 0;
  for (const row of band.rows) {
    const moved = ensure(painter, 16 * scale, resume);
    const cells = row.map((cell, index) => {
      if (index !== 0) {
        return cell;
      }
      if ((cell.rowSpan ?? 1) > 1 || (cell.text && !cell.mergeContinue)) {
        mergeLabel = cell.text;
        mergeLeft = Math.max(1, cell.rowSpan ?? 1);
      }
      if (cell.mergeContinue && moved && mergeLabel && mergeLeft > 0) {
        return { text: mergeLabel, rowSpan: mergeLeft, wrap: true };
      }
      return cell;
    });
    paintCells(painter, columns, cells, 17 * scale, 8 * scale, false);
    mergeLeft = Math.max(0, mergeLeft - 1);
    if (mergeLeft === 0) {
      mergeLabel = '';
    }
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

function paintColumns(painter: Painter, columns: SheetColumn[], scale = 1): void {
  const height = 20 * scale;
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
  columns.forEach((column, index) => {
    const width = CONTENT_WIDTH * column.width;
    const size = 8 * scale;
    const baseline = top - (height + size) / 2;
    if (index > 0) {
      painter.page.drawLine({
        start: { x, y: top },
        end: { x, y: top - height },
        thickness: 0.35,
        color: LINE,
      });
    }
    drawFitted(
      painter,
      column.text,
      column.align === 'right' ? x + width - 5 : x + 5,
      baseline,
      size,
      MUTED,
      width - 10,
      column.align,
    );
    x += width;
  });
  painter.page.drawLine({
    start: { x: MARGIN_X, y: top - height },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: top - height },
    thickness: 0.7,
    color: LINE,
  });
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
  let x = MARGIN_X;
  columns.forEach((column, index) => {
    const width = CONTENT_WIDTH * column.width;
    const cell = cells[index] ?? { text: '' };
    const color = cell.tone === 'danger' ? DANGER : cell.tone === 'muted' ? MUTED : INK;
    const openMerge = (cell.rowSpan ?? 1) > 1;
    // Skip internal rules inside a vertical merge; the last row of the run draws the bottom edge.
    if (!cell.mergeContinue && !openMerge) {
      painter.page.drawLine({
        start: { x, y: top - height },
        end: { x: x + width, y: top - height },
        thickness: total ? 0.7 : 0.35,
        color: LINE,
      });
    }
    if (index > 0) {
      painter.page.drawLine({
        start: { x, y: top },
        end: { x, y: top - height },
        thickness: 0.25,
        color: LINE,
      });
    }
    if (cell.text) {
      const pad = 5;
      const maxWidth = Math.max(8, width - pad * 2);
      const leftX = x + pad;
      const rightX = x + width - pad;
      if (cell.wrap) {
        // One wrapped word/line per merged body row so long sub-types stay readable.
        const maxLines = Math.max(1, cell.rowSpan ?? 1);
        const lines = wrapToRows(painter.font, cell.text, size, maxWidth, maxLines);
        lines.forEach((line, lineIndex) => {
          const baseline = top - lineIndex * height - (height + size) / 2;
          drawFitted(
            painter,
            line,
            column.align === 'right' ? rightX : leftX,
            baseline,
            size,
            color,
            maxWidth,
            column.align,
          );
        });
      } else {
        drawFitted(
          painter,
          cell.text,
          column.align === 'right' ? rightX : leftX,
          top - (height + size) / 2,
          size,
          color,
          maxWidth,
          column.align,
        );
      }
    }
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
  forceNewPage(painter, true);
  resume?.();
  return true;
}

/** Start a fresh A4 page. Overflow pages show “Continued”; section breaks do not. */
function forceNewPage(painter: Painter, showContinued: boolean): void {
  painter.page = painter.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  painter.y = PAGE_HEIGHT - MARGIN_TOP;
  const size = 9;
  const periodWidth = painter.font.widthOfTextAtSize(painter.sheet.period, 8);
  drawFitted(
    painter,
    painter.sheet.businessName,
    MARGIN_X,
    painter.y - size,
    size,
    INK,
    CONTENT_WIDTH - periodWidth - 12,
    'left',
  );
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
  if (showContinued) {
    left(painter, painter.sheet.continued, 8, MUTED, 2);
  }
  rule(painter, LINE, 0.6, 6);
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

/** Prefer one word per row when wrapping into a merged cell; fall back to width wrap. */
function wrapToRows(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source || maxLines <= 0) {
    return [];
  }
  const words = source.split(' ').filter(Boolean);
  let lines: string[];
  if (words.length > 1 && words.length <= maxLines && words.every((word) => font.widthOfTextAtSize(word, size) <= maxWidth)) {
    lines = words;
  } else {
    lines = wrap(font, source, size, maxWidth);
  }
  if (lines.length <= maxLines) {
    return lines;
  }
  const kept = lines.slice(0, maxLines);
  const overflow = lines.slice(maxLines - 1).join(' ');
  kept[maxLines - 1] = fit(font, overflow, size, maxWidth);
  return kept;
}

function graphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map((part) => part.segment);
  }
  return [...value];
}
