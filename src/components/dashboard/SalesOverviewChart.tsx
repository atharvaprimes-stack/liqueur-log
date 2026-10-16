import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';

import { parseDateKey, parseMonthKey, type ChartPeriod } from '../../domain/dates';
import { formatInr } from '../../domain/money';
import type { DashboardSalesPoint } from '../../domain/models/dashboard';
import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

type SalesOverviewChartProps = {
  last7Days: DashboardSalesPoint[];
  last12Months: DashboardSalesPoint[];
  locale: string;
};

type ChartDatum = {
  value: number;
  label: string;
  bucketLabel: string;
  dataPointColor: string;
  dataPointRadius: number;
  focusedDataPointColor: string;
  focusedDataPointRadius: number;
};

export function SalesOverviewChart({ last7Days, last12Months, locale }: SalesOverviewChartProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [period, setPeriod] = useState<ChartPeriod>('days7');
  const [width, setWidth] = useState(0);

  const series = period === 'days7' ? last7Days : last12Months;
  const totalSales = useMemo(() => series.reduce((sum, point) => sum + point.amount, 0), [series]);
  const peakAmount = useMemo(() => Math.max(0, ...series.map((point) => point.amount)), [series]);

  const data = useMemo<ChartDatum[]>(
    () =>
      series.map((point) => {
        const shortLabel = formatAxisLabel(point.bucket, period, locale);
        const bucketLabel = formatTooltipLabel(point.bucket, period, locale);
        const isPeak = peakAmount > 0 && point.amount === peakAmount;
        return {
          value: point.amount,
          label: shortLabel,
          bucketLabel,
          dataPointColor: isPeak ? palette.idle : palette.accent,
          dataPointRadius: isPeak ? 6 : 4,
          focusedDataPointColor: isPeak ? palette.idle : palette.accent,
          focusedDataPointRadius: isPeak ? 8 : 6,
        };
      }),
    [locale, palette.accent, palette.idle, peakAmount, period, series],
  );

  const chartWidth = Math.max(width - 8, 240);
  const spacing =
    data.length <= 1 ? chartWidth * 0.45 : Math.max(22, (chartWidth - 40) / Math.max(data.length - 1, 1));

  return (
    <View className="rounded-2xl border border-line bg-surface p-4" style={getCardShadow(palette)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold text-ink">{t('home.salesOverview')}</Text>
          <Text className="mt-1 text-sm font-semibold text-muted">{formatInr(totalSales)}</Text>
        </View>
      </View>

      <View className="mt-3 flex-row rounded-2xl bg-canvas p-1">
        <PeriodToggle
          label={t('home.chart.days7')}
          selected={period === 'days7'}
          onPress={() => setPeriod('days7')}
        />
        <PeriodToggle
          label={t('home.chart.months12')}
          selected={period === 'months12'}
          onPress={() => setPeriod('months12')}
        />
      </View>

      <View className="mt-4" onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          data.every((point) => point.value <= 0) ? (
            <View className="h-52 items-center justify-center rounded-2xl bg-canvas">
              <Text className="text-sm font-semibold text-muted">{t('home.noSalesYet')}</Text>
            </View>
          ) : (
            <LineChart
              areaChart
              curved
              data={data}
              height={200}
              width={chartWidth}
              spacing={spacing}
              initialSpacing={14}
              endSpacing={14}
              color={palette.accent}
              thickness={3}
              startFillColor={palette.accent}
              endFillColor={palette.accent}
              startOpacity={0.38}
              endOpacity={0.02}
              hideDataPoints={false}
              dataPointsColor={palette.accent}
              dataPointsRadius={4}
              yAxisTextStyle={{ color: palette.muted, fontSize: 10 }}
              xAxisLabelTextStyle={{
                color: palette.muted,
                fontSize: period === 'months12' ? 9 : 10,
                width: period === 'months12' ? 28 : 36,
              }}
              yAxisColor="transparent"
              xAxisColor={palette.line}
              rulesColor={palette.line}
              rulesType="solid"
              noOfSections={4}
              maxValue={Math.max(peakAmount, 1) * 1.18}
              formatYLabel={(value) => compactInr(Number(value))}
              pointerConfig={{
                pointerStripHeight: 168,
                pointerStripColor: palette.line,
                pointerStripWidth: 1,
                pointerColor: palette.accent,
                radius: 6,
                pointerLabelWidth: 148,
                pointerLabelHeight: 56,
                activatePointersOnLongPress: false,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (items: ChartDatum[]) => {
                  const item = items?.[0];
                  const value = item?.value ?? 0;
                  const dayOrMonth = item?.bucketLabel ?? '';
                  return (
                    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: palette.ink }}>
                      <Text className="text-[11px] font-semibold" style={{ color: palette.canvas }}>
                        {dayOrMonth}
                      </Text>
                      <Text className="mt-0.5 text-xs font-bold" style={{ color: palette.canvas }}>
                        {formatInr(value)}
                      </Text>
                    </View>
                  );
                },
              }}
            />
          )
        ) : (
          <View className="h-52" />
        )}
      </View>

      {peakAmount > 0 ? (
        <Text className="mt-2 text-xs font-semibold text-muted">
          {t('home.chart.peakHint', {
            amount: formatInr(peakAmount),
            when: peakLabel(series, period, locale),
          })}
        </Text>
      ) : null}
    </View>
  );
}

function PeriodToggle({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-9 min-w-0 flex-1 items-center justify-center rounded-xl px-2 ${
        selected ? 'border border-line bg-surface' : ''
      }`}
      style={selected ? getCardShadow(palette) : undefined}
    >
      <Text className={`text-center text-xs font-bold ${selected ? 'text-ink' : 'text-muted'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatAxisLabel(bucket: string, period: ChartPeriod, locale: string): string {
  if (period === 'days7') {
    const date = parseDateKey(bucket);
    if (!date) {
      return bucket;
    }
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }

  const date = parseMonthKey(bucket);
  if (!date) {
    return bucket;
  }
  return date.toLocaleDateString(locale, { month: 'short' });
}

function formatTooltipLabel(bucket: string, period: ChartPeriod, locale: string): string {
  if (period === 'days7') {
    const date = parseDateKey(bucket);
    if (!date) {
      return bucket;
    }
    return date.toLocaleDateString(locale, { weekday: 'long' });
  }

  const date = parseMonthKey(bucket);
  if (!date) {
    return bucket;
  }
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function peakLabel(series: DashboardSalesPoint[], period: ChartPeriod, locale: string): string {
  const peak = Math.max(0, ...series.map((point) => point.amount));
  const point = series.find((entry) => entry.amount === peak);
  if (!point) {
    return '';
  }
  return formatTooltipLabel(point.bucket, period, locale);
}

function compactInr(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value >= 100000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(Math.round(value));
}
