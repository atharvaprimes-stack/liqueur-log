import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { displayBillNumber } from '../../domain/billing';
import { formatInr } from '../../domain/money';
import type { DashboardRecentOrder } from '../../domain/models/dashboard';
import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

const MAX_RECENT_ORDERS = 5;

export function RecentOrdersList({ orders }: { orders: DashboardRecentOrder[] }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const visibleOrders = orders.slice(0, MAX_RECENT_ORDERS);

  return (
    <View className="rounded-2xl border border-line bg-surface p-4" style={getCardShadow(palette)}>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="text-base font-bold text-ink">{t('home.recentOrders')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.seeAll')}
          onPress={() => router.push('/table/history')}
          className="flex-row items-center gap-1"
        >
          <Text className="text-sm font-bold text-accent">{t('home.seeAll')}</Text>
          <Ionicons name="chevron-forward" size={14} color={palette.accent} />
        </Pressable>
      </View>

      {visibleOrders.length === 0 ? (
        <View className="items-center rounded-2xl border border-line bg-canvas px-4 py-6">
          <Ionicons name="receipt-outline" size={22} color={palette.muted} />
          <Text className="mt-2 text-center text-sm font-semibold text-muted">{t('home.noRecentOrders')}</Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {visibleOrders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </View>
      )}
    </View>
  );
}

function OrderRow({ order }: { order: DashboardRecentOrder }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('mr') ? 'mr-IN' : 'en-IN';
  const badge = orderBadge(order);
  const tableLabel =
    order.orderType === 'COUNTER'
      ? t('tables.counter')
      : t('billing.tableTitle', { number: order.tableId ?? '—' });
  const timestamp = formatTimestamp(order.createdAt, locale);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (order.status === 'OPEN') {
          if (order.orderType === 'COUNTER') {
            router.push('/table/counter');
            return;
          }
          if (order.tableId) {
            router.push(`/table/${order.tableId}`);
            return;
          }
        }
        router.push(`/table/bill/${order.id}`);
      }}
      className="flex-row items-center gap-3 rounded-2xl border border-line bg-canvas px-3 py-3"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="min-w-0 flex-1 text-sm font-bold text-ink" numberOfLines={1}>
            {displayBillNumber(order.sequence)}
            <Text className="font-semibold text-muted">{` · ${tableLabel}`}</Text>
          </Text>
          <StatusBadge label={t(badge.labelKey)} background={badge.background} color={badge.color} />
        </View>
        <Text className="mt-1 text-xs font-medium text-muted" numberOfLines={1}>
          {timestamp}
        </Text>
      </View>

      <Text className="text-sm font-bold text-ink">{formatInr(order.totalAmount)}</Text>
    </Pressable>
  );
}

function StatusBadge({
  label,
  background,
  color,
}: {
  label: string;
  background: string;
  color: string;
}) {
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: background }}>
      <Text className="text-[10px] font-bold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function orderBadge(order: DashboardRecentOrder): {
  labelKey: 'home.statusOpenTab' | 'home.statusPaid' | 'home.statusCredit';
  background: string;
  color: string;
} {
  if (order.status === 'OPEN') {
    return {
      labelKey: 'home.statusOpenTab',
      background: 'rgba(56, 189, 248, 0.16)',
      color: '#38bdf8',
    };
  }
  if (order.isCredit) {
    return {
      labelKey: 'home.statusCredit',
      background: 'rgba(251, 146, 60, 0.16)',
      color: '#fb923c',
    };
  }
  return {
    labelKey: 'home.statusPaid',
    background: 'rgba(74, 222, 128, 0.16)',
    color: '#4ade80',
  };
}

function formatTimestamp(epochMs: number, locale: string): string {
  if (!epochMs) {
    return '—';
  }
  return new Date(epochMs).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
