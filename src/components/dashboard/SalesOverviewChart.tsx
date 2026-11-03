import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';

import { parseDateKey, parseMonthKey, type ChartPeriod } from '../../domain/dates';
import { formatInr } from '../../domain/money';
import type { DashboardSalesPoint } from '../../domain/models/dashboard';
import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

type ChartMetric = 'saleValue' | 'orderCount';

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
  const [metric, setMetric] = useState<ChartMetric>('saleValue');
  const [period, setPeriod] = useState<ChartPeriod>('days7');
  const [width, setWidth] = useState(0);

  const series = period === 'days7' ? last7Days : last12Months;
  const metricValues = useMemo(
    () => series.map((point) => (metric === 'saleValue' ? point.amount : point.orderCount)),
    [metric, series],
  );
  const total = useMemo(() => metricValues.reduce((sum, value) => sum + value, 0), [metricValues]);
  const peakValue = useMemo(() => Math.max(0, ...metricValues), [metricValues]);

  const data = useMemo<ChartDatum[]>(
    () =>
      series.map((point, index) => {
        const value = metricValues[index] ?? 0;
        const shortLabel = formatAxisLabel(point.bucket, period, locale);
        const bucketLabel = formatTooltipLabel(point.bucket, period, locale);
        const isPeak = peakValue > 0 && value === peakValue;
        return {
          value,
          label: shortLabel,
          bucketLabel,
          dataPointColor: isPeak ? palette.idle : palette.accent,
          dataPointRadius: isPeak ? 6 : 4,
          focusedDataPointColor: isPeak ? palette.idle : palette.accent,
          focusedDataPointRadius: isPeak ? 8 : 6,
        };
      }),
    [locale, metricValues, palette.accent, palette.idle, peakValue, period, series],
  );

  const chartWidth = Math.max(width - 8, 240);
  const spacing =
    data.length <= 1 ? chartWidth * 0.45 : Math.max(22, (chartWidth - 40) / Math.max(data.length - 1, 1));
  const formatValue = (value: number) =>
    metric === 'saleValue' ? formatInr(value) : t('home.chart.ordersValue', { count: value });

  return (
    <View className="rounded-2xl border border-line bg-surface p-4" style={getCardShadow(palette)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold text-ink">{t('home.salesOverview')}</Text>
          <Text className="mt-1 text-sm font-semibold text-muted">{formatValue(total)}</Text>
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

      <View className="mt-2 flex-row rounded-2xl bg-canvas p-1">
        <PeriodToggle
          label={t('home.chart.saleValue')}
          selected={metric === 'saleValue'}
          onPress={() => setMetric('saleValue')}
        />
        <PeriodToggle
          label={t('home.chart.orderCount')}
          selected={metric === 'orderCount'}
          onPress={() => setMetric('orderCount')}
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
              maxValue={Math.max(peakValue, 1) * 1.18}
              formatYLabel={(value) =>
                metric === 'saleValue' ? compactInr(Number(value)) : compactCount(Number(value))
              }
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
                        {formatValue(value)}
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

      {peakValue > 0 ? (
        <Text className="mt-2 text-xs font-semibold text-muted">
          {t(metric === 'saleValue' ? 'home.chart.peakHint' : 'home.chart.peakOrdersHint', {
            amount: formatInr(peakValue),
            count: peakValue,
            when: peakLabel(series, metric, period, locale),
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

function peakLabel(
  series: DashboardSalesPoint[],
  metric: ChartMetric,
  period: ChartPeriod,
  locale: string,
): string {
  const peak = Math.max(0, ...series.map((point) => (metric === 'saleValue' ? point.amount : point.orderCount)));
  const point = series.find((entry) => (metric === 'saleValue' ? entry.amount : entry.orderCount) === peak);
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

function compactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return String(Math.round(value));
}
