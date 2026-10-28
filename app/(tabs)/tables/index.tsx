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
import { PLATE_WELL_RADIUS, TablePlaceSetting } from '../../../src/components/TablePlaceSetting';
import { useAuth } from '../../../src/context/AuthContext';
import { orderErrorCode, type OrderErrorCode } from '../../../src/domain/errors';
import { formatInr } from '../../../src/domain/money';
import type { FloorTable } from '../../../src/domain/models/orders';
import { useFloor } from '../../../src/hooks/useFloor';
import { useTableRequests } from '../../../src/hooks/useTableRequests';
import { resolveBottomInset } from '../../../src/navigation/bottomInset';
import { useTheme } from '../../../src/theme/theme-context';
import type { ThemeId, ThemePalette } from '../../../src/theme/themes';

/** Mark width as a fraction of the card content width (keeps cutlery on-screen). */
const MARK_WIDTH_RATIO = 0.78;
const MARK_MIN = 64;
const MARK_MAX = 112;

type CardKind = 'available' | 'occupied' | 'pending';

type FloorCardTone = {
  /** Card background. */
  base: string;
  /** Press overlay tint. */
  tint: string;
  ink: string;
  muted: string;
  badgeBackground: string;
  border: string;
  /** Solid plate disc (matches the badge art). */
  plateFill: string;
  /** Table number on the solid plate. */
  numberColor: string;
  glow?: string;
};

const FLOOR_CARD_TONES: Record<ThemeId, Record<CardKind, FloorCardTone>> = {
  light: {
    available: {
      base: '#ECFDF5',
      tint: 'transparent',
      ink: '#047857',
      muted: '#059669',
      badgeBackground: 'rgba(4, 120, 87, 0.12)',
      border: 'rgba(4, 120, 87, 0.22)',
      plateFill: '#047857',
      numberColor: '#ECFDF5',
    },
    occupied: {
      base: '#FEF2F2',
      tint: 'transparent',
      ink: '#B91C1C',
      muted: '#DC2626',
      badgeBackground: 'rgba(185, 28, 28, 0.12)',
      border: 'rgba(185, 28, 28, 0.22)',
      plateFill: '#B91C1C',
      numberColor: '#FEF2F2',
    },
    pending: {
      base: '#FFFBEB',
      tint: 'transparent',
      ink: '#B45309',
      muted: '#D97706',
      badgeBackground: 'rgba(180, 83, 9, 0.14)',
      border: 'rgba(245, 158, 11, 0.4)',
      glow: 'rgba(245, 158, 11, 0.45)',
      plateFill: '#B45309',
      numberColor: '#FFFBEB',
    },
  },
  dark: {
    available: {
      base: '#1E293B',
      tint: 'rgba(52, 211, 153, 0.1)',
      ink: '#34D399',
      muted: '#6EE7B7',
      badgeBackground: 'rgba(52, 211, 153, 0.18)',
      border: 'rgba(52, 211, 153, 0.4)',
      plateFill: '#059669',
      numberColor: '#ECFDF5',
    },
    occupied: {
      base: '#1E293B',
      tint: 'rgba(248, 113, 113, 0.1)',
      ink: '#F87171',
      muted: '#FCA5A5',
      badgeBackground: 'rgba(248, 113, 113, 0.18)',
      border: 'rgba(248, 113, 113, 0.4)',
      plateFill: '#DC2626',
      numberColor: '#FEF2F2',
    },
    pending: {
      base: '#1E293B',
      tint: 'rgba(251, 191, 36, 0.12)',
      ink: '#FBBF24',
      muted: '#FCD34D',
      badgeBackground: 'rgba(251, 191, 36, 0.2)',
      border: 'rgba(251, 191, 36, 0.45)',
      glow: 'rgba(251, 191, 36, 0.5)',
      plateFill: '#D97706',
      numberColor: '#FFFBEB',
    },
  },
  amber: {
    available: {
      base: '#211710',
      tint: 'rgba(16, 185, 129, 0.12)',
      ink: '#34D399',
      muted: '#6EE7B7',
      badgeBackground: 'rgba(16, 185, 129, 0.2)',
      border: 'rgba(16, 185, 129, 0.42)',
      plateFill: '#047857',
      numberColor: '#ECFDF5',
    },
    occupied: {
      base: '#211710',
      tint: 'rgba(239, 68, 68, 0.12)',
      ink: '#F87171',
      muted: '#FCA5A5',
      badgeBackground: 'rgba(239, 68, 68, 0.2)',
      border: 'rgba(239, 68, 68, 0.42)',
      plateFill: '#B91C1C',
      numberColor: '#FEF2F2',
    },
    pending: {
      base: '#211710',
      tint: 'rgba(245, 158, 11, 0.14)',
      ink: '#FBBF24',
      muted: '#FDE68A',
      badgeBackground: 'rgba(245, 158, 11, 0.22)',
      border: 'rgba(251, 191, 36, 0.5)',
      glow: 'rgba(251, 191, 36, 0.55)',
      plateFill: '#B45309',
      numberColor: '#FFFBEB',
    },
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

          <View className="mt-2 flex-row flex-wrap">
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
  const [markSize, setMarkSize] = useState(MARK_MIN);

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

  // Keep the number inside the plate well across mark sizes / digit counts.
  const wellDiameter = markSize * ((PLATE_WELL_RADIUS * 2) / 100);
  const numberSize = Math.min(
    wellDiameter * (table.number.length > 2 ? 0.42 : table.number.length > 1 ? 0.52 : 0.62),
    wellDiameter * 0.7,
  );

  return (
    <Animated.View
      className="w-full overflow-hidden rounded-2xl border"
      style={[{ backgroundColor: tone.base, borderColor }, cardShadow]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tables.tableA11y', { number: table.number, status: statusLabel })}
        onPress={onPress}
        className="items-center px-2.5 pb-2.5 pt-2"
        style={({ pressed }) => ({
          backgroundColor: tone.tint,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        {/* Top: fixed-height row so available / occupied cards match */}
        <View className="mb-1.5 h-5 w-full flex-row items-center justify-between gap-2">
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.badgeBackground }}>
            <Text className="text-[10px] font-semibold tracking-wide" style={{ color: tone.ink }}>
              {t(statusKey)}
            </Text>
          </View>
          {order ? (
            <Text className="text-[11px] font-semibold" style={{ color: tone.muted }}>
              {formatElapsed(order.createdAt)}
            </Text>
          ) : (
            <View className="h-4 w-8" />
          )}
        </View>

        {/* Center: place setting scales with card width so it never clips */}
        <View
          className="w-full items-center justify-center"
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            const next = Math.round(Math.min(MARK_MAX, Math.max(MARK_MIN, width * MARK_WIDTH_RATIO)));
            setMarkSize((prev) => (prev === next ? prev : next));
          }}
        >
          <View className="items-center justify-center" style={{ height: markSize, width: markSize }}>
            <TablePlaceSetting size={markSize} color={tone.ink} plateFill={tone.plateFill} />
            <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
              <Text
                className="font-bold leading-none"
                numberOfLines={1}
                style={{ color: tone.numberColor, fontSize: numberSize, maxWidth: wellDiameter * 0.9 }}
              >
                {table.number}
              </Text>
            </View>
            {kind === 'pending' ? (
              <View className="absolute right-0 top-0 h-5 min-w-5 items-center justify-center rounded-full bg-amber-700 px-1">
                <Text className="text-[10px] font-bold leading-none text-white">
                  {table.pendingRequestCount > 9 ? '9+' : table.pendingRequestCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Bottom: fixed-height footer — empty when available, metrics when occupied/pending */}
        <View className="mt-2 h-9 w-full items-center justify-center">
          {kind === 'pending' && !order ? (
            <View className="flex-row items-center justify-center gap-1">
              <Ionicons name="notifications" size={12} color={tone.ink} />
              <Text className="text-xs font-semibold" numberOfLines={1} style={{ color: tone.ink }}>
                {t('tables.pendingRequest', { count: table.pendingRequestCount })}
              </Text>
            </View>
          ) : order ? (
            <View className="w-full items-center gap-0.5">
              <Text className="text-sm font-bold" numberOfLines={1} style={{ color: tone.ink }}>
                {formatInr(order.totalAmount)}
              </Text>
              <Text className="text-[11px] font-medium" numberOfLines={1} style={{ color: tone.muted }}>
                {kind === 'pending'
                  ? t('tables.pendingRequest', { count: table.pendingRequestCount })
                  : t('tables.itemCount', { count: order.itemCount })}
              </Text>
            </View>
          ) : null}
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
