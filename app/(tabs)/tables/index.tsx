import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { orderErrorCode, type OrderErrorCode } from '../../../src/domain/errors';
import { formatInr } from '../../../src/domain/money';
import type { FloorTable } from '../../../src/domain/models/orders';
import { useFloor } from '../../../src/hooks/useFloor';
import { useTableRequests } from '../../../src/hooks/useTableRequests';
import { resolveBottomInset } from '../../../src/navigation/bottomInset';
import { useTheme } from '../../../src/theme/theme-context';
import type { ThemeId, ThemePalette } from '../../../src/theme/themes';

type CardKind = 'available' | 'occupied' | 'pending';

type FloorCardTone = {
  /** Solid surface under translucent status tint (dark/amber). */
  base: string;
  /** Fill color — solid pastel on light, faint rgba tint on dark/amber. */
  tint: string;
  ink: string;
  muted: string;
  badgeBackground: string;
  border: string;
  glow?: string;
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

const PENDING_LIGHT: FloorCardTone = {
  base: '#FEF3C7',
  tint: 'transparent',
  ink: '#92400E',
  muted: '#B45309',
  badgeBackground: 'rgba(245, 158, 11, 0.16)',
  border: 'rgba(245, 158, 11, 0.35)',
  glow: 'rgba(245, 158, 11, 0.45)',
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

/** Shared faint amber tint for dark + amber pending cards. */
const PENDING_TINTED: Omit<FloorCardTone, 'base'> = {
  tint: 'rgba(245, 158, 11, 0.14)',
  ink: '#FBBF24',
  muted: '#FCD34D',
  badgeBackground: 'rgba(245, 158, 11, 0.2)',
  border: 'rgba(251, 191, 36, 0.45)',
  glow: 'rgba(251, 191, 36, 0.5)',
};

const FLOOR_CARD_TONES: Record<ThemeId, Record<CardKind, FloorCardTone>> = {
  light: { available: AVAILABLE_LIGHT, occupied: OCCUPIED_LIGHT, pending: PENDING_LIGHT },
  dark: {
    available: { ...AVAILABLE_TINTED, base: '#1E293B' },
    occupied: { ...OCCUPIED_TINTED, base: '#1E293B' },
    pending: { ...PENDING_TINTED, base: '#1E293B' },
  },
  amber: {
    available: { ...AVAILABLE_TINTED, base: '#211710' },
    occupied: { ...OCCUPIED_TINTED, base: '#211710' },
    pending: { ...PENDING_TINTED, base: '#211710' },
  },
};

export default function TablesScreen() {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const { currentTenant } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { tables, counter, isLoading, errorCode, startTable } = useFloor();
  const { summaryForTable } = useTableRequests();
  const [pending, setPending] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<OrderErrorCode | null>(null);

  const venueName = currentTenant?.businessName || t('appName');
  const floorTables = useMemo(
    () =>
      tables.map((table) => ({
        ...table,
        pendingRequestCount: summaryForTable(table.number)?.count ?? 0,
      })),
    [summaryForTable, tables],
  );
  const activeCount = useMemo(
    () => floorTables.filter((table) => table.order !== null).length,
    [floorTables],
  );
  const totalCount = floorTables.length;

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
    <ScreenWrapper padded={false} header={false}>
      {isLoading ? (
        <ActivityIndicator className="mt-10" color={palette.accent} />
      ) : (
        <ScrollView contentContainerClassName="px-3 pb-6 pt-2">
          <View className="gap-3">
            <View className="px-0.5">
              <Text className="text-xl font-semibold text-ink" numberOfLines={1}>
                {venueName}
              </Text>
              <Text className="mt-1 text-sm font-medium text-muted">
                {t('tables.activeSummary', { active: activeCount, total: totalCount })}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tables.counter')}
              onPress={() => router.push('/table/counter')}
              className="min-h-14 flex-row items-center justify-between rounded-xl bg-accent px-4 py-3"
              style={getSoftShadow(palette)}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-accent-ink">{t('tables.counter')}</Text>
                {counter ? (
                  <Text className="mt-0.5 text-sm font-medium text-accent-ink">
                    {t('tables.counterOpen', { amount: formatInr(counter.totalAmount) })}
                  </Text>
                ) : null}
              </View>
              <View className="ml-3 h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <Ionicons name="storefront-outline" size={18} color={palette.accentInk} />
              </View>
            </Pressable>
          </View>

          {errorCode ? (
            <Text className="px-0.5 pt-3 text-sm text-danger">{t(`billing.errors.${errorCode}`)}</Text>
          ) : null}

          <View className="mt-3 flex-row flex-wrap">
            {floorTables.map((table) => (
              <View key={table.number} className="w-1/2 p-1.5">
                <TableCard
                  table={table}
                  onPress={() => {
                    if (table.order || table.pendingRequestCount > 0) {
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
            className="mx-0.5 mt-3 h-12 items-center justify-center rounded-xl border border-line bg-surface"
            style={getSoftShadow(palette, 0.6)}
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

            <Text className="mt-4 text-center text-xl font-semibold text-ink">{t('tables.startTitle')}</Text>
            <Text className="mt-1.5 text-center text-sm font-medium text-muted">
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
                  <Text className="text-base font-semibold text-accent-ink">{t('tables.startConfirm')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

function TableCard({ table, onPress }: { table: FloorTable; onPress: () => void }) {
  const { t } = useTranslation();
  const { theme, palette } = useTheme();
  const order = table.order;
  const kind: CardKind =
    table.pendingRequestCount > 0 ? 'pending' : order !== null ? 'occupied' : 'available';
  const tone = FLOOR_CARD_TONES[theme][kind];
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (kind !== 'pending') {
      pulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [kind, pulse]);

  const statusKey =
    kind === 'pending'
      ? 'tables.statusPending'
      : kind === 'occupied'
        ? 'tables.statusOccupied'
        : 'tables.statusAvailable';

  const statusLabel =
    kind === 'pending'
      ? t('tables.pendingRequest', { count: table.pendingRequestCount })
      : order
        ? `${t('tables.occupied')} ${formatInr(order.totalAmount)}`
        : t('tables.available');

  const borderColor =
    kind === 'pending'
      ? pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [tone.border, tone.glow ?? tone.border],
        })
      : tone.border;

  const cardShadow =
    kind === 'available'
      ? getSoftShadow(palette)
      : kind === 'pending'
        ? ({
            shadowColor: tone.glow ?? tone.border,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] }),
            shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [4, 10] }),
            elevation: 3,
          } satisfies Animated.WithAnimatedObject<ViewStyle>)
        : getSoftShadow(palette, 0.5);

  return (
    <Animated.View
      className="w-full overflow-hidden rounded-2xl border"
      style={[{ backgroundColor: tone.base, borderColor }, cardShadow]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tables.tableA11y', { number: table.number, status: statusLabel })}
        onPress={onPress}
        className="min-h-[8.5rem] justify-between p-3.5"
        style={({ pressed }) => ({
          backgroundColor: tone.tint,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        {/* Top: status pill + elapsed time */}
        <View className="min-h-6 flex-row items-center justify-between gap-2">
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.badgeBackground }}>
            <Text className="text-[10px] font-semibold tracking-wide" style={{ color: tone.ink }}>
              {t(statusKey)}
            </Text>
          </View>
          {order ? (
            <Text className="text-xs font-semibold" style={{ color: tone.muted }}>
              {formatElapsed(order.createdAt)}
            </Text>
          ) : (
            <View className="h-4 w-8" />
          )}
        </View>

        {/* Center: table number */}
        <View className="flex-1 items-center justify-center py-2">
          <Text className="text-3xl font-bold leading-none" style={{ color: tone.ink }}>
            {table.number}
          </Text>
        </View>

        {/* Bottom: bill metrics for occupied / pending */}
        <View className="min-h-10 justify-end">
          {kind === 'pending' && !order ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="notifications" size={12} color={tone.ink} />
              <Text className="text-xs font-semibold" numberOfLines={1} style={{ color: tone.ink }}>
                {t('tables.pendingRequest', { count: table.pendingRequestCount })}
              </Text>
            </View>
          ) : order ? (
            <View className="gap-0.5">
              <Text className="text-sm font-bold" numberOfLines={1} style={{ color: tone.ink }}>
                {formatInr(order.totalAmount)}
              </Text>
              <Text className="text-xs font-medium" numberOfLines={1} style={{ color: tone.muted }}>
                {kind === 'pending'
                  ? t('tables.pendingRequest', { count: table.pendingRequestCount })
                  : t('tables.itemCount', { count: order.itemCount })}
              </Text>
            </View>
          ) : (
            <View className="h-8" />
          )}
        </View>
      </Pressable>
    </Animated.View>
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

function getSoftShadow(palette: ThemePalette, strength = 1): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: palette.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: Math.min(palette.shadowOpacity * strength * 1.25, 0.22),
        shadowRadius: 6,
      },
      android: {
        elevation: Math.max(1, Math.round(palette.elevation * strength * 0.75)),
      },
      default: {},
    }) ?? {}
  );
}
