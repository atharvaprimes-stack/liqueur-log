import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { orderErrorCode, type OrderErrorCode } from '../../../src/domain/errors';
import { formatInr } from '../../../src/domain/money';
import type { FloorTable } from '../../../src/domain/models/orders';
import type { TableRequestSummary } from '../../../src/domain/models/tableRequests';
import { useFloor } from '../../../src/hooks/useFloor';
import { useTableRequests } from '../../../src/hooks/useTableRequests';
import { resolveBottomInset } from '../../../src/navigation/bottomInset';
import { useTheme } from '../../../src/theme/theme-context';
import type { ThemeId } from '../../../src/theme/themes';

export default function TablesScreen() {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { tables, counter, isLoading, errorCode, startTable } = useFloor();
  const { summaryForTable } = useTableRequests();
  const [pending, setPending] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<OrderErrorCode | null>(null);

  const confirmStart = async () => {
    if (!pending || starting) {
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const tableNumber = pending;
      await startTable(tableNumber);
      setPending(null);
      router.push(`/table/${tableNumber}`);
    } catch (error) {
      setStartError(orderErrorCode(error));
      setStarting(false);
    }
  };

  return (
    <ScreenWrapper padded={false}>
      {isLoading ? (
        <ActivityIndicator className="mt-10" color={palette.accent} />
      ) : (
        <ScrollView contentContainerClassName="px-2.5 pb-6 pt-3">
          <View className="px-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tables.counter')}
              onPress={() => router.push('/table/counter')}
              className="min-h-16 items-center justify-center rounded-2xl bg-accent px-4 py-3"
            >
              <Text className="text-center text-base font-bold text-accent-ink">{t('tables.counter')}</Text>
              {counter ? (
                <Text className="mt-1 text-center text-sm font-semibold text-accent-ink">
                  {t('tables.counterOpen', { amount: formatInr(counter.totalAmount) })}
                </Text>
              ) : null}
            </Pressable>
          </View>
          {errorCode ? <Text className="px-1.5 pt-2 text-sm text-danger">{t(`billing.errors.${errorCode}`)}</Text> : null}
          <View className="mt-3 flex-row flex-wrap">
            {tables.map((table) => (
              <View key={table.number} className="w-1/2 p-1.5">
                <TableCard
                  table={table}
                  pendingRequests={table.order ? summaryForTable(table.number) : null}
                  onPress={() => {
                    if (table.order) {
                      router.push(`/table/${table.number}`);
                      return;
                    }
                    setStartError(null);
                    setStarting(false);
                    setPending(table.number);
                  }}
                />
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/table/history')}
            className="mx-1.5 mt-3 h-12 items-center justify-center rounded-lg border border-line bg-surface"
          >
            <Text className="text-base font-semibold text-ink">{t('billing.historyTitle')}</Text>
          </Pressable>
        </ScrollView>
      )}
      <Modal
        visible={pending !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!starting) {
            setPending(null);
          }
        }}
      >
        <View style={themeStyle} className="flex-1 justify-end">
          <Pressable
            accessibilityRole="button"
            className="flex-1 bg-black/50"
            disabled={starting}
            onPress={() => setPending(null)}
          />
          <View
            className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4"
            style={{ paddingBottom: bottomInset + 16 }}
          >
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />

            <View className="self-center rounded-full bg-accent/15 px-4 py-1.5">
              <Text className="text-sm font-semibold text-accent">
                {t('billing.tableTitle', { number: pending ?? '' })}
              </Text>
            </View>

            <Text className="mt-4 text-center text-xl font-bold text-ink">{t('tables.startTitle')}</Text>
            <Text className="mt-1.5 text-center text-sm text-muted">
              {t('tables.startBody', { number: pending ?? '' })}
            </Text>

            {startError ? (
              <Text className="mt-3 text-center text-sm text-danger">{t(`billing.errors.${startError}`)}</Text>
            ) : null}

            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                disabled={starting}
                onPress={() => setPending(null)}
                className="h-14 min-w-0 flex-1 items-center justify-center rounded-xl border border-line bg-canvas disabled:opacity-50"
              >
                <Text className="text-base font-semibold text-muted">{t('tables.startCancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={starting}
                onPress={() => {
                  void confirmStart();
                }}
                className="h-14 min-w-0 flex-1 items-center justify-center rounded-xl bg-accent disabled:opacity-50"
              >
                {starting ? (
                  <ActivityIndicator color={palette.accentInk} />
                ) : (
                  <Text className="text-base font-bold text-accent-ink">{t('tables.startConfirm')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

type FloorCardTone = {
  /** Solid surface under translucent status tint (dark/amber). */
  base: string;
  /** Fill color — solid pastel on light, faint rgba tint on dark/amber. */
  tint: string;
  ink: string;
  muted: string;
  badgeBackground: string;
  border: string;
};

const AVAILABLE_LIGHT: FloorCardTone = {
  base: '#DCFCE7',
  tint: 'transparent',
  ink: '#15803D',
  muted: '#166534',
  badgeBackground: 'rgba(21, 128, 61, 0.12)',
  border: 'rgba(21, 128, 61, 0.2)',
};

const OCCUPIED_LIGHT: FloorCardTone = {
  base: '#FEE2E2',
  tint: 'transparent',
  ink: '#991B1B',
  muted: '#B91C1C',
  badgeBackground: 'rgba(153, 27, 27, 0.12)',
  border: 'rgba(153, 27, 27, 0.2)',
};

/** Shared faint green tint for dark + amber available cards. */
const AVAILABLE_TINTED: Omit<FloorCardTone, 'base'> = {
  tint: 'rgba(34, 197, 94, 0.12)',
  ink: '#4ADE80',
  muted: '#4ADE80',
  badgeBackground: 'rgba(34, 197, 94, 0.18)',
  border: 'rgba(34, 197, 94, 0.4)',
};

/** Shared faint crimson tint for dark + amber occupied cards. */
const OCCUPIED_TINTED: Omit<FloorCardTone, 'base'> = {
  tint: 'rgba(239, 68, 68, 0.12)',
  ink: '#F87171',
  muted: '#F87171',
  badgeBackground: 'rgba(239, 68, 68, 0.18)',
  border: 'rgba(239, 68, 68, 0.4)',
};

const REQUEST_PENDING_LIGHT: FloorCardTone = {
  base: '#FEF9C3',
  tint: 'rgba(234, 179, 8, 0.15)',
  ink: '#A16207',
  muted: '#A16207',
  badgeBackground: 'rgba(234, 179, 8, 0.22)',
  border: 'rgba(234, 179, 8, 0.55)',
};

const REQUEST_PENDING_TINTED: Omit<FloorCardTone, 'base'> = {
  tint: 'rgba(234, 179, 8, 0.15)',
  ink: '#FACC15',
  muted: '#FACC15',
  badgeBackground: 'rgba(234, 179, 8, 0.22)',
  border: 'rgba(234, 179, 8, 0.55)',
};

const FLOOR_CARD_TONES: Record<
  ThemeId,
  { occupied: FloorCardTone; available: FloorCardTone; pending: FloorCardTone }
> = {
  light: { occupied: OCCUPIED_LIGHT, available: AVAILABLE_LIGHT, pending: REQUEST_PENDING_LIGHT },
  dark: {
    occupied: { ...OCCUPIED_TINTED, base: '#1E293B' },
    available: { ...AVAILABLE_TINTED, base: '#1E293B' },
    pending: { ...REQUEST_PENDING_TINTED, base: '#1E293B' },
  },
  amber: {
    occupied: { ...OCCUPIED_TINTED, base: '#211710' },
    available: { ...AVAILABLE_TINTED, base: '#211710' },
    pending: { ...REQUEST_PENDING_TINTED, base: '#211710' },
  },
};

function TableCard({
  table,
  pendingRequests,
  onPress,
}: {
  table: FloorTable;
  pendingRequests: TableRequestSummary | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const order = table.order;
  const occupied = order !== null;
  const hasPending = (pendingRequests?.count ?? 0) > 0;
  const tone = hasPending
    ? FLOOR_CARD_TONES[theme].pending
    : occupied
      ? FLOOR_CARD_TONES[theme].occupied
      : FLOOR_CARD_TONES[theme].available;
  const status = occupied
    ? `${t('tables.occupied')} ${formatInr(order.totalAmount)}`
    : t('tables.available');
  const requestLabel = hasPending
    ? t('tables.requestBadge', {
        count: pendingRequests!.count,
        amount: formatInr(pendingRequests!.totalAmount),
      })
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        requestLabel
          ? `${t('tables.tableA11y', { number: table.number, status })}. ${t('tables.requestBadgeA11y', {
              count: pendingRequests!.count,
              amount: formatInr(pendingRequests!.totalAmount),
            })}`
          : t('tables.tableA11y', { number: table.number, status })
      }
      onPress={onPress}
      className="h-32 w-full overflow-hidden rounded-xl border"
      style={{ backgroundColor: tone.base, borderColor: tone.border }}
    >
      <View className="h-full w-full justify-between p-3" style={{ backgroundColor: tone.tint }}>
        <View className="min-h-5 justify-center">
          {hasPending ? (
            <View className="self-start rounded-md px-1.5 py-0.5" style={{ backgroundColor: tone.badgeBackground }}>
              <Text className="text-[10px] font-bold" numberOfLines={1} style={{ color: tone.ink }}>
                {requestLabel}
              </Text>
            </View>
          ) : occupied ? (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-xs font-bold" numberOfLines={1} style={{ color: tone.ink }}>
                {t('tables.occupied')}
              </Text>
              <Text className="text-xs font-bold uppercase" numberOfLines={1} style={{ color: tone.ink }}>
                {formatElapsed(order.createdAt)}
              </Text>
            </View>
          ) : (
            <View className="self-start rounded-md px-1.5 py-0.5" style={{ backgroundColor: tone.badgeBackground }}>
              <Text className="text-xs font-medium" style={{ color: tone.muted }}>
                {t('tables.available')}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-1 items-center justify-center">
          <Text className="text-3xl font-bold" style={{ color: tone.ink }}>
            {table.number}
          </Text>
        </View>

        <View className="min-h-5 justify-center">
          {occupied ? (
            <Text className="text-sm font-medium" numberOfLines={1} style={{ color: tone.ink }}>
              {t('tables.metrics', {
                amount: formatInr(order.totalAmount),
                items: t('tables.itemCount', { count: order.itemCount }),
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Compact elapsed time for open tabs, e.g. "35 M" or "1 H". */
function formatElapsed(createdAt: number, now = Date.now()): string {
  const totalMinutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes} M`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} H` : `${hours} H ${minutes} M`;
}
