import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ActionRow } from '../../../src/components/FormActions';
import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import {
  formatDateKey,
  presentReport,
  type ReportKind,
  type ReportPreset,
  type SheetCell,
  type SheetColumn,
  type SheetTable,
  type SummaryPair,
} from '../../../src/domain/reports';
import { useReport } from '../../../src/hooks/useReport';
import { buildReportPdf } from '../../../src/printing/reportPdf';
import { printPdfDocument, sharePdfDocument } from '../../../src/printing/receiptFile';
import { useTheme } from '../../../src/theme/theme-context';

const KINDS: ReportKind[] = ['sales', 'purchases', 'stock'];
const PRESETS: ReportPreset[] = ['day', 'month', 'custom'];

export default function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const { palette } = useTheme();
  const { currentUser } = useAuth();
  const [kind, setKind] = useState<ReportKind>('sales');
  const [preset, setPreset] = useState<ReportPreset>('day');
  const [fromKey, setFromKey] = useState(monthStartKey);
  const [toKey, setToKey] = useState(() => formatDateKey(Date.now()));
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { report, isLoading, failed, invalidRange } = useReport(preset, fromKey, toKey);
  const sheet = useMemo(
    () => (report ? presentReport(report, kind, (key, values) => String(t(key, values)), i18n.language) : null),
    [i18n.language, kind, report, t],
  );
  const ready = Boolean(sheet) && !isLoading && !invalidRange && !failed;

  if (currentUser && currentUser.role !== 'ADMIN') {
    return <Redirect href="/home" />;
  }

  const exportReport = async (action: 'share' | 'print') => {
    if (!sheet || !ready || busy) {
      return;
    }
    setBusy(action);
    setNotice(null);
    try {
      const pdf = await buildReportPdf(sheet);
      if (action === 'share') {
        const result = await sharePdfDocument(pdf.bytes, pdf.fileName);
        if (result === 'downloaded') {
          setNotice(t('reports.downloaded'));
        } else if (result === 'unopened') {
          setNotice(t('reports.shareFailed'));
        }
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
    kind === 'sales' ? 'reports.salesHint' : kind === 'purchases' ? 'reports.purchaseHint' : 'reports.stockHint';
  const titleKey =
    kind === 'sales' ? 'reports.salesReport' : kind === 'purchases' ? 'reports.purchaseReport' : 'reports.stockReport';

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-4">
          <ChoiceRow
            options={KINDS.map((option) => ({ id: option, label: t(`reports.${option}`) }))}
            selected={kind}
            onSelect={setKind}
          />

          <View className="pt-3">
            <ChoiceRow
              options={PRESETS.map((option) => ({ id: option, label: t(`reports.${option}`) }))}
              selected={preset}
              onSelect={setPreset}
            />
          </View>

          {preset === 'custom' ? (
            <View className="pt-3">
              <View className="flex-row gap-3">
                <DateField label={t('reports.from')} value={fromKey} onChange={setFromKey} />
                <DateField label={t('reports.to')} value={toKey} onChange={setToKey} />
              </View>
              <Text className="pt-2 text-xs text-muted">{t('reports.dateHint')}</Text>
            </View>
          ) : null}

          <View className="pt-6">
            <Text className="text-lg font-semibold text-ink">{sheet?.title ?? t(titleKey)}</Text>
            <Text className="pt-1 text-sm leading-5 text-muted">{t(hint)}</Text>

            {invalidRange ? <Text className="pt-4 text-sm text-muted">{t('reports.invalidRange')}</Text> : null}

            {!invalidRange && isLoading && !sheet ? (
              <View className="items-start pt-5">
                <ActivityIndicator color={palette.accent} />
              </View>
            ) : null}

            {!invalidRange && !isLoading && failed && !sheet ? (
              <Text className="pt-4 text-sm text-danger">{t('reports.failed')}</Text>
            ) : null}

            {sheet ? (
              <View className="pt-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink">{sheet.period}</Text>
                  {isLoading ? <ActivityIndicator color={palette.accent} /> : null}
                </View>
                <Text className="pt-1 text-xs text-muted">{sheet.generated}</Text>

                <View className={`mt-3 gap-3 ${width >= 720 ? 'flex-row' : ''}`}>
                  <SummaryCard pairs={sheet.summaryLeft} />
                  <SummaryCard pairs={sheet.summaryRight} />
                </View>

                <ReportTable table={sheet.table} />
                <Text className="pt-4 text-xs leading-5 text-muted">{sheet.footnote}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {notice ? <Text className="px-4 pb-2 text-center text-sm text-muted">{notice}</Text> : null}
        <ActionRow
          pinned
          leading={{
            label: t('reports.print'),
            onPress: () => void exportReport('print'),
            disabled: !ready || Boolean(busy),
            busy: busy === 'print',
          }}
          trailing={{
            label: t('reports.whatsapp'),
            onPress: () => void exportReport('share'),
            tone: 'accent',
            disabled: !ready || Boolean(busy),
            busy: busy === 'share',
          }}
        />
      </View>
    </ScreenWrapper>
  );
}

function monthStartKey(): string {
  const now = new Date();
  return formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
}

function ChoiceRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const active = selected === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.id)}
            className={`h-10 flex-1 items-center justify-center rounded-lg border px-2 ${
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
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <View className="min-w-0 flex-1">
      <Text className="mb-1 text-xs font-semibold text-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => onChange(next.replace(/[^\d-]/g, '').slice(0, 10))}
        placeholder="2026-10-15"
        placeholderTextColor={palette.muted}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink"
      />
    </View>
  );
}

function SummaryCard({ pairs }: { pairs: SummaryPair[] }) {
  return (
    <View className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2">
      {pairs.map((pair) => (
        <View key={pair.label} className="flex-row items-baseline justify-between gap-2 py-1">
          <Text
            className={`min-w-0 flex-1 ${pair.strong ? 'text-[13px] font-semibold text-ink' : 'text-[12px] text-muted'}`}
            numberOfLines={2}
          >
            {pair.label}
          </Text>
          <Text
            className={`shrink-0 text-right ${pair.strong ? 'text-sm font-semibold text-ink' : 'text-[13px] text-ink'}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {pair.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportTable({ table }: { table: SheetTable }) {
  const { width } = useWindowDimensions();
  const tableWidth = Math.max(width - 32, table.columns.length > 4 ? 640 : 520);

  if (table.empty) {
    return <Text className="pt-4 text-sm text-muted">{table.empty}</Text>;
  }

  return (
    <View className="mt-4">
      <Text className="text-base font-semibold text-ink">{table.title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
        <View style={{ width: tableWidth }} className="border-t border-line">
          <TableCells columns={table.columns} cells={table.columns.map((column) => ({ text: column.text }))} header />
          {table.groups.map((group, groupIndex) => (
            <View key={`${group.title}-${groupIndex}`}>
              <View className="border-b border-line bg-surface px-3 py-2">
                <Text className="text-sm font-semibold text-ink">{group.title}</Text>
                {group.note ? <Text className="pt-1 text-[12px] leading-4 text-muted">{group.note}</Text> : null}
              </View>
              {group.bands.map((band, bandIndex) => (
                <View key={`${group.title}-${bandIndex}`}>
                  {band.title ? (
                    <View className="border-b border-line px-3 py-1.5">
                      <Text className="text-[12px] font-medium text-ink">{band.title}</Text>
                    </View>
                  ) : null}
                  {band.rows.map((row, rowIndex) => (
                    <TableCells key={`${group.title}-${bandIndex}-${rowIndex}`} columns={table.columns} cells={row} />
                  ))}
                </View>
              ))}
              <TableCells columns={table.columns} cells={group.total} total />
            </View>
          ))}
          {table.extra ? <TableCells columns={table.columns} cells={table.extra} /> : null}
          {table.grand ? <TableCells columns={table.columns} cells={table.grand} total /> : null}
        </View>
      </ScrollView>
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
    <View className={`min-h-9 flex-row items-center border-b border-line px-3 ${total ? 'bg-surface' : ''}`}>
      {columns.map((column, index) => {
        const cell = cells[index];
        const tone = cell?.tone === 'danger' ? 'text-danger' : cell?.tone === 'muted' || header ? 'text-muted' : 'text-ink';
        return (
          <Text
            key={`${column.text}-${index}`}
            numberOfLines={header ? 2 : 1}
            className={`${tone} ${header ? 'text-[11px] font-semibold' : 'text-[12px]'} ${total ? 'font-semibold' : ''}`}
            style={{ flex: column.width, textAlign: column.align, fontVariant: ['tabular-nums'] }}
          >
            {cell?.text}
          </Text>
        );
      })}
    </View>
  );
}
