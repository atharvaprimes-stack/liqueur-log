import { createElement, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ActionRow } from '../../../src/components/FormActions';
import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import {
  formatDateKey,
  presentReport,
  type ReportKind,
  type ReportPreset,
  type ReportSheet,
  type SheetCell,
  type SheetColumn,
  type SheetTable,
  type SummaryPair,
} from '../../../src/domain/reports';
import { useCatalogSheet } from '../../../src/hooks/useCatalogSheet';
import { useReport } from '../../../src/hooks/useReport';
import { resolveBottomInset } from '../../../src/navigation/bottomInset';
import { buildReportPdf } from '../../../src/printing/reportPdf';
import {
  printPdfDocument,
  savePdfDocument,
  sharePdfDocument,
} from '../../../src/printing/receiptFile';
import { useTheme } from '../../../src/theme/theme-context';

type ReportsView = ReportKind | 'catalog';
type ExportAction = 'print' | 'share' | 'save';

type PdfBundle = {
  bytes: Uint8Array;
  fileName: string;
};

const VIEWS: ReportsView[] = ['sales', 'purchases', 'stock', 'catalog'];

export default function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser } = useAuth();
  const [view, setView] = useState<ReportsView>('sales');
  const [preset, setPreset] = useState<ReportPreset>('month');
  const [fromKey, setFromKey] = useState(monthStartKey);
  const [toKey, setToKey] = useState(() => formatDateKey(Date.now()));
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfBundle | null>(null);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsDateRange = view === 'sales' || view === 'purchases';
  const isCatalog = view === 'catalog';
  const reportPreset: ReportPreset = needsDateRange ? preset : 'month';
  const reportFromKey = needsDateRange ? fromKey : monthStartKey();
  const reportToKey = needsDateRange ? toKey : formatDateKey(Date.now());

  const { report, isLoading: reportLoading, failed: reportFailed, invalidRange } = useReport(
    reportPreset,
    reportFromKey,
    reportToKey,
  );
  const {
    sheet: catalogSheet,
    isLoading: catalogLoading,
    failed: catalogFailed,
  } = useCatalogSheet(isCatalog);
  const reportSheet = useMemo(
    () =>
      view !== 'catalog' && report
        ? presentReport(report, view, (key, values) => String(t(key, values)), i18n.language)
        : null,
    [i18n.language, report, t, view],
  );
  const sheet = isCatalog ? catalogSheet : reportSheet;
  const isLoading = isCatalog ? catalogLoading : reportLoading;
  const failed = isCatalog ? catalogFailed : reportFailed;
  const rangeBlocked = needsDateRange && invalidRange;
  const ready = Boolean(sheet) && !isLoading && !failed && !rangeBlocked;
  const monthNow = new Date();
  const monthCardSubtitle = `${t(`reports.monthLong.${monthNow.getMonth() + 1}`)} ${monthNow.getFullYear()}`;

  if (currentUser && currentUser.role !== 'ADMIN') {
    return <Redirect href="/home" />;
  }

  const openExportPreview = async () => {
    if (!sheet || !ready || exporting) {
      return;
    }
    setExporting(true);
    setNotice(null);
    try {
      const next = await buildReportPdf(sheet);
      setPdf(next);
      setPreviewOpen(true);
    } catch {
      setNotice(t('reports.failed'));
      setPdf(null);
    } finally {
      setExporting(false);
    }
  };

  const closePreview = () => {
    if (busy) {
      return;
    }
    setPreviewOpen(false);
    setPdf(null);
  };

  const runExportAction = async (action: ExportAction) => {
    if (!pdf || busy) {
      return;
    }
    setBusy(action);
    setNotice(null);
    try {
      if (action === 'share') {
        const result = await sharePdfDocument(pdf.bytes, pdf.fileName);
        if (result === 'downloaded') {
          setNotice(t('reports.downloaded'));
        } else if (result === 'unopened') {
          setNotice(t('reports.shareFailed'));
        }
      } else if (action === 'save') {
        const result = await savePdfDocument(pdf.bytes, pdf.fileName);
        setNotice(result === 'downloaded' ? t('reports.downloaded') : t('reports.saved'));
      } else {
        await printPdfDocument(pdf.bytes, pdf.fileName);
      }
    } catch {
      setNotice(t('reports.failed'));
    } finally {
      setBusy(null);
    }
  };

  const hint =
    view === 'sales'
      ? 'reports.salesHint'
      : view === 'purchases'
        ? 'reports.purchaseHint'
        : view === 'stock'
          ? 'reports.stockHint'
          : 'reports.catalogHint';
  const titleKey =
    view === 'sales'
      ? 'reports.salesReport'
      : view === 'purchases'
        ? 'reports.purchaseReport'
        : view === 'stock'
          ? 'reports.stockReport'
          : 'reports.catalogReport';

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1 bg-canvas">
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-4">
          <ReportTypeGrid
            options={VIEWS.map((option) => ({ id: option, label: t(`reports.${option}`) }))}
            selected={view}
            onSelect={setView}
          />

          {needsDateRange ? (
            <View className="mt-4 gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('reports.period')}
              </Text>
              <PeriodSegment
                monthLabel={t('reports.month')}
                customLabel={t('reports.custom')}
                selected={preset === 'custom' ? 'custom' : 'month'}
                onSelect={setPreset}
              />
              {preset === 'month' ? (
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {monthCardSubtitle}
                </Text>
              ) : (
                <View className="pt-1">
                  <View className="flex-row gap-3">
                    <DatePickerField
                      label={t('reports.from')}
                      value={fromKey}
                      maximumDate={parseDateKey(toKey) ?? undefined}
                      onChange={(next) => {
                        setFromKey(next);
                        if (toKey < next) {
                          setToKey(next);
                        }
                      }}
                    />
                    <DatePickerField
                      label={t('reports.to')}
                      value={toKey}
                      minimumDate={parseDateKey(fromKey) ?? undefined}
                      onChange={(next) => {
                        setToKey(next);
                        if (fromKey > next) {
                          setFromKey(next);
                        }
                      }}
                    />
                  </View>
                  <Text className="pt-2 text-xs text-muted">{t('reports.dateHint')}</Text>
                </View>
              )}
            </View>
          ) : null}

          <View className="pt-6">
            <Text className="text-lg font-semibold text-ink" numberOfLines={2}>
              {sheet?.title ?? t(titleKey)}
            </Text>
            <Text className="pt-1 text-sm leading-5 text-muted">{t(hint)}</Text>

            {rangeBlocked ? (
              <Text className="pt-4 text-sm text-muted">{t('reports.invalidRange')}</Text>
            ) : null}

            {!rangeBlocked && isLoading && !sheet ? (
              <View className="items-start pt-5">
                <ActivityIndicator color={palette.accent} />
              </View>
            ) : null}

            {!rangeBlocked && !isLoading && failed && !sheet ? (
              <Text className="pt-4 text-sm text-danger">{t('reports.failed')}</Text>
            ) : null}

            {sheet ? (
              <View className="pt-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink" numberOfLines={2}>
                    {sheet.period}
                  </Text>
                  {isLoading ? <ActivityIndicator color={palette.accent} /> : null}
                </View>
                <Text className="pt-1 text-xs text-muted" numberOfLines={2}>
                  {sheet.generated}
                </Text>

                {sheet.summaryLeft.length > 0 || sheet.summaryRight.length > 0 ? (
                  <SummaryColumns left={sheet.summaryLeft} right={sheet.summaryRight} />
                ) : null}

                <ReportTable table={sheet.table} />
                <Text className="pt-4 text-xs leading-5 text-muted">{sheet.footnote}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {notice && !previewOpen ? (
          <Text className="px-4 pb-2 pt-1 text-center text-sm text-muted">{notice}</Text>
        ) : null}

        <View className="border-t border-line bg-surface px-4 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || exporting }}
            disabled={!ready || exporting}
            onPress={() => void openExportPreview()}
            className="h-12 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
          >
            {exporting ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text className="text-base font-semibold text-accent-ink">{t('reports.exportPdf')}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <A4PreviewModal
        visible={previewOpen && Boolean(sheet) && Boolean(pdf)}
        sheet={sheet}
        busy={busy}
        notice={notice}
        onClose={closePreview}
        onPrint={() => void runExportAction('print')}
        onShare={() => void runExportAction('share')}
        onSave={() => void runExportAction('save')}
      />
    </ScreenWrapper>
  );
}

function A4PreviewModal({
  visible,
  sheet,
  busy,
  notice,
  onClose,
  onPrint,
  onShare,
  onSave,
}: {
  visible: boolean;
  sheet: ReportSheet | null;
  busy: ExportAction | null;
  notice: string | null;
  onClose: () => void;
  onPrint: () => void;
  onShare: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  // Preview card matches ISO A4 portrait proportions (210 × 297).
  const paperWidth = Math.min(width - 24, 595);
  const paperHeight = Math.round(paperWidth * (297 / 210));
  const actionsDisabled = Boolean(busy) || !sheet;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <Text className="min-w-0 flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {t('reports.previewTitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={onClose}
            className="h-10 items-center justify-center rounded-lg border border-line bg-canvas px-3 disabled:opacity-50"
          >
            <Text className="text-sm font-semibold text-ink">{t('reports.closePreview')}</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 bg-canvas"
          contentContainerStyle={{
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: 24,
            minHeight: height * 0.55,
          }}
        >
          {sheet ? (
            <View
              style={{ width: paperWidth, minHeight: paperHeight }}
              className="overflow-hidden rounded-sm border border-line bg-surface px-5 py-6"
            >
              <Text className="text-center text-base font-semibold text-ink" numberOfLines={2}>
                {sheet.businessName}
              </Text>
              {sheet.address ? (
                <Text className="pt-1 text-center text-[11px] leading-4 text-muted">{sheet.address}</Text>
              ) : null}
              {sheet.licenseLine ? (
                <Text className="pt-0.5 text-center text-[11px] leading-4 text-muted">{sheet.licenseLine}</Text>
              ) : null}
              <View className="my-3 h-0.5 bg-accent" />
              <Text className="text-center text-sm font-semibold text-ink" numberOfLines={2}>
                {sheet.title}
              </Text>
              <Text className="pt-1 text-center text-[13px] font-medium text-ink" numberOfLines={2}>
                {sheet.period}
              </Text>
              <Text className="pt-1 text-center text-[11px] text-muted" numberOfLines={2}>
                {sheet.generated}
              </Text>

              {sheet.summaryLeft.length > 0 || sheet.summaryRight.length > 0 ? (
                <SummaryColumns left={sheet.summaryLeft} right={sheet.summaryRight} />
              ) : null}

              <ReportTable table={sheet.table} paper paperWidth={paperWidth - 40} />
              <Text className="pt-4 text-[11px] leading-4 text-muted">{sheet.footnote}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          className="border-t border-line bg-surface px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
        >
          {notice ? <Text className="pb-2 text-center text-sm text-muted">{notice}</Text> : null}
          <ActionRow
            className=""
            leading={{
              label: t('reports.print'),
              onPress: onPrint,
              disabled: actionsDisabled,
              busy: busy === 'print',
            }}
            middle={{
              label: t('reports.whatsapp'),
              onPress: onShare,
              tone: 'accent',
              disabled: actionsDisabled,
              busy: busy === 'share',
            }}
            trailing={{
              label: t('reports.save'),
              onPress: onSave,
              disabled: actionsDisabled,
              busy: busy === 'save',
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function monthStartKey(): string {
  const now = new Date();
  return formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
}

function ReportTypeGrid({
  options,
  selected,
  onSelect,
}: {
  options: { id: ReportsView; label: string }[];
  selected: ReportsView;
  onSelect: (id: ReportsView) => void;
}) {
  const rows = [options.slice(0, 2), options.slice(2, 4)];
  return (
    <View className="gap-2">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-2">
          {row.map((option) => {
            const active = selected === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(option.id)}
                className={`h-12 min-w-0 flex-1 items-center justify-center rounded-xl border px-2 ${
                  active ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text
                  className={`text-center text-[13px] font-semibold ${active ? 'text-accent-ink' : 'text-ink'}`}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PeriodSegment({
  monthLabel,
  customLabel,
  selected,
  onSelect,
}: {
  monthLabel: string;
  customLabel: string;
  selected: 'month' | 'custom';
  onSelect: (value: ReportPreset) => void;
}) {
  return (
    <View className="h-9 flex-row rounded-lg border border-line bg-canvas p-0.5">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === 'month' }}
        onPress={() => onSelect('month')}
        className={`min-w-0 flex-1 items-center justify-center rounded-md px-2 ${
          selected === 'month' ? 'bg-surface' : ''
        }`}
      >
        <Text
          className={`text-[13px] font-semibold ${selected === 'month' ? 'text-ink' : 'text-muted'}`}
          numberOfLines={1}
        >
          {monthLabel}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === 'custom' }}
        onPress={() => onSelect('custom')}
        className={`min-w-0 flex-1 items-center justify-center rounded-md px-2 ${
          selected === 'custom' ? 'bg-surface' : ''
        }`}
      >
        <Text
          className={`text-[13px] font-semibold ${selected === 'custom' ? 'text-ink' : 'text-muted'}`}
          numberOfLines={1}
        >
          {customLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
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

function DatePickerField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = parseDateKey(value) ?? new Date();
  const display = `${selected.getDate()} ${t(`reports.monthShort.${selected.getMonth() + 1}`)} ${selected.getFullYear()}`;

  const applyDate = (event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
    }
    if (event.type === 'dismissed') {
      setOpen(false);
      return;
    }
    if (!next) {
      return;
    }
    onChange(formatDateKey(next.getTime()));
  };

  return (
    <View className="min-w-0 flex-1">
      <Text className="mb-1 text-xs font-semibold text-muted">{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value,
          min: minimumDate ? formatDateKey(minimumDate.getTime()) : undefined,
          max: maximumDate ? formatDateKey(maximumDate.getTime()) : undefined,
          onChange: (event: { target: { value: string } }) => {
            if (event.target.value) {
              onChange(event.target.value);
            }
          },
          className: 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink',
          style: {
            color: palette.ink,
            borderColor: palette.line,
            backgroundColor: palette.canvas,
            height: 44,
            borderWidth: 1,
            borderRadius: 12,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 16,
          },
        })
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            className="h-11 flex-row items-center justify-between rounded-xl border border-line bg-canvas px-3"
          >
            <Text className="min-w-0 flex-1 text-base text-ink" numberOfLines={1}>
              {display}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={palette.muted} />
          </Pressable>
          {open && Platform.OS === 'android' ? (
            <DateTimePicker
              value={selected}
              mode="date"
              display="default"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={applyDate}
            />
          ) : null}
          {Platform.OS === 'ios' ? (
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
              <View className="flex-1 justify-end bg-black/50">
                <Pressable accessibilityRole="button" className="flex-1" onPress={() => setOpen(false)} />
                <View className="rounded-t-3xl border-t border-line bg-surface px-4 pb-6 pt-3">
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-base font-semibold text-ink">{label}</Text>
                    <Pressable accessibilityRole="button" onPress={() => setOpen(false)} className="px-2 py-1">
                      <Text className="text-sm font-semibold text-accent">{t('reports.periodApply')}</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={selected}
                    mode="date"
                    display="spinner"
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    onChange={applyDate}
                  />
                </View>
              </View>
            </Modal>
          ) : null}
        </>
      )}
    </View>
  );
}

function SummaryColumns({ left, right }: { left: SummaryPair[]; right: SummaryPair[] }) {
  return (
    <View className="mt-3 flex-row gap-2">
      {left.length > 0 ? <SummaryColumn pairs={left} /> : null}
      {right.length > 0 ? <SummaryColumn pairs={right} /> : null}
    </View>
  );
}

function SummaryColumn({ pairs }: { pairs: SummaryPair[] }) {
  return (
    <View className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2">
      {pairs.map((pair, index) => (
        <View key={`${pair.label}-${index}`} className={index > 0 ? 'pt-2' : undefined}>
          <Text className="text-[11px] font-medium text-muted" numberOfLines={2}>
            {pair.label}
          </Text>
          <Text
            className={`pt-0.5 ${pair.strong ? 'text-base font-semibold text-ink' : 'text-sm font-semibold text-ink'}`}
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {pair.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportTable({
  table,
  paper = false,
  paperWidth,
}: {
  table: SheetTable;
  paper?: boolean;
  paperWidth?: number;
}) {
  const { width } = useWindowDimensions();
  const tableWidth = paper
    ? Math.max(paperWidth ?? Math.min(width - 64, 555), 280)
    : Math.max(width - 32, table.columns.length > 5 ? 720 : 560);

  if (table.empty) {
    return <Text className="pt-4 text-sm text-muted">{table.empty}</Text>;
  }

  const tableBody = (
    <View style={{ width: tableWidth }} className="overflow-hidden rounded-xl border border-line">
      <TableCells columns={table.columns} cells={table.columns.map((column) => ({ text: column.text }))} header />
      {table.groups.map((group, groupIndex) => (
        <View key={`${group.title}-${groupIndex}`}>
          {group.title ? (
            <View className="border-b border-line bg-surface px-3 py-2">
              <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                {group.title}
              </Text>
              {group.note ? (
                <Text className="pt-1 text-[12px] leading-4 text-muted" numberOfLines={3}>
                  {group.note}
                </Text>
              ) : null}
            </View>
          ) : group.note ? (
            <View className="border-b border-line bg-surface px-3 py-2">
              <Text className="text-[12px] leading-4 text-muted" numberOfLines={3}>
                {group.note}
              </Text>
            </View>
          ) : null}
          {group.bands.map((band, bandIndex) => (
            <View key={`${group.title}-${bandIndex}`}>
              {band.title ? (
                <View className="border-b border-line px-3 py-1.5">
                  <Text className="text-[12px] font-medium text-ink" numberOfLines={2}>
                    {band.title}
                  </Text>
                </View>
              ) : null}
              {band.rows.map((row, rowIndex) => (
                <TableCells key={`${group.title}-${bandIndex}-${rowIndex}`} columns={table.columns} cells={row} />
              ))}
            </View>
          ))}
          {group.total ? <TableCells columns={table.columns} cells={group.total} total /> : null}
        </View>
      ))}
      {table.extra ? <TableCells columns={table.columns} cells={table.extra} /> : null}
      {table.grand ? <TableCells columns={table.columns} cells={table.grand} total /> : null}
    </View>
  );

  return (
    <View className="mt-4">
      <Text className="text-base font-semibold text-ink" numberOfLines={1}>
        {table.title}
      </Text>
      {paper ? (
        <View className="mt-2">{tableBody}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator className="mt-2">
          {tableBody}
        </ScrollView>
      )}
    </View>
  );
}

function TableCells({
  columns,
  cells,
  header = false,
  total = false,
}: {
  columns: SheetColumn[];
  cells: SheetCell[];
  header?: boolean;
  total?: boolean;
}) {
  return (
    <View className={`min-h-9 flex-row items-center border-b border-line px-2 ${total ? 'bg-surface' : ''}`}>
      {columns.map((column, index) => {
        const cell = cells[index];
        const tone = cell?.tone === 'danger' ? 'text-danger' : cell?.tone === 'muted' || header ? 'text-muted' : 'text-ink';
        return (
          <Text
            key={`${column.text}-${index}`}
            numberOfLines={header ? 2 : 1}
            ellipsizeMode="tail"
            className={`${tone} px-1 ${header ? 'text-[11px] font-semibold' : 'text-[12px]'} ${total ? 'font-semibold' : ''}`}
            style={{ flex: column.width, textAlign: column.align, fontVariant: ['tabular-nums'] }}
          >
            {cell?.text}
          </Text>
        );
      })}
    </View>
  );
}
