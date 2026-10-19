import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { formatInr } from '../../domain/money';
import type { DashboardSnapshot } from '../../domain/models/dashboard';
import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

type Tone = 'orange' | 'purple' | 'green' | 'red';

const TONES: Record<Tone, { iconBg: string; icon: string }> = {
  orange: { iconBg: 'rgba(251, 146, 60, 0.16)', icon: '#f97316' },
  purple: { iconBg: 'rgba(168, 85, 247, 0.16)', icon: '#a855f7' },
  green: { iconBg: 'rgba(74, 222, 128, 0.16)', icon: '#22c55e' },
  red: { iconBg: 'rgba(248, 113, 113, 0.16)', icon: '#ef4444' },
};

export function MetricCards({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { t } = useTranslation();
  const stockAlerts = snapshot.lowCount + snapshot.outCount;
  const availableTables = Math.max(snapshot.tableCount - snapshot.occupiedTables, 0);

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1">
          <MetricCard
            tone="orange"
            icon="wallet-outline"
            label={t('home.totalRevenue')}
            value={formatInr(snapshot.todaySales)}
            subtext={t('home.thisMonthAmount', { amount: formatInr(snapshot.monthSales) })}
          />
        </View>
        <Pressable className="min-w-0 flex-1" onPress={() => router.push('/table/history')}>
          <MetricCard
            tone="purple"
            icon="receipt-outline"
            label={t('home.orders')}
            value={formatCount(snapshot.todayOrders)}
            subtext={t('home.thisMonthOrders', { count: formatCount(snapshot.monthOrders) })}
          />
        </Pressable>
      </View>

      <View className="flex-row gap-3">
        <Pressable className="min-w-0 flex-1" onPress={() => router.push('/tables')}>
          <MetricCard
            tone="green"
            icon="grid-outline"
            label={t('home.tables')}
            value={`${formatCount(snapshot.occupiedTables)} / ${formatCount(snapshot.tableCount)}`}
            subtext={t('home.tablesAvailable', { count: formatCount(availableTables) })}
          />
        </Pressable>
        <Pressable
          className="min-w-0 flex-1"
          onPress={() =>
            stockAlerts > 0
              ? router.push({ pathname: '/stock', params: { focus: 'low', at: String(Date.now()) } })
              : router.push('/stock')
          }
        >
          <MetricCard
            tone="red"
            icon="alert-circle-outline"
            label={t('home.stockAlerts')}
            value={formatCount(stockAlerts)}
            subtext={
              stockAlerts === 0
                ? t('home.noLowItems')
                : t('home.lowInStock', { count: formatCount(stockAlerts) })
            }
            subtextTone={stockAlerts > 0 ? 'danger' : 'muted'}
          />
        </Pressable>
      </View>
    </View>
  );
}

function MetricCard({
  tone,
  icon,
  label,
  value,
  subtext,
  subtextTone = 'muted',
}: {
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subtext: string;
  subtextTone?: 'muted' | 'danger' | 'idle';
}) {
  const { palette } = useTheme();
  const colors = TONES[tone];
  const subtextClass =
    subtextTone === 'danger' ? 'text-danger' : subtextTone === 'idle' ? 'text-idle' : 'text-muted';

  return (
    <View className="w-full rounded-2xl border border-line bg-surface p-3.5" style={getCardShadow(palette)}>
      <View
        className="mb-3 h-10 w-10 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.iconBg }}
      >
        <Ionicons name={icon} size={20} color={colors.icon} />
      </View>
      <Text className="text-xs font-bold uppercase tracking-wide text-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="mt-1.5 text-[22px] font-bold leading-7 text-ink"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className={`mt-1.5 text-xs font-medium ${subtextClass}`} numberOfLines={2}>
        {subtext}
      </Text>
    </View>
  );
}

function formatCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-IN');
}
