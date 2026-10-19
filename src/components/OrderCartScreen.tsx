import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { displayBillNumber, lineTotalPaise } from '../domain/billing';
import type { OrderErrorCode } from '../domain/errors';
import { formatInr } from '../domain/money';
import {
  filterOrderCatalog,
  itemNames,
  volumeMessage,
  type OrderCatalogSection,
  type StockItem,
} from '../domain/models/inventory';
import { balancePaise, type OrderLine, type PaymentMethod } from '../domain/models/orders';
import { useBilling } from '../hooks/useBilling';
import { useOrderCart, type CartTarget } from '../hooks/useOrderCart';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { useAuth } from '../context/AuthContext';
import { useBottomInset } from '../navigation/bottomInset';
import { leaveScreen } from '../navigation/leave';
import { useTheme } from '../theme/theme-context';
import { ActionRow } from './FormActions';
import { PaymentSheet } from './PaymentSheet';
import { ScreenWrapper } from './ScreenWrapper';
import { ThermalReceipt } from './ThermalReceipt';

export function OrderCartScreen({ target, parent }: { target: CartTarget; parent: Href }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const bottomInset = useBottomInset();
  const cart = useOrderCart(target);
  const billing = useBilling();
  const scrollRef = useRef<ScrollView>(null);
  const orderSectionOffset = useRef(0);
  const rowOffsets = useRef<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<OrderCatalogSection>('bar');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<'failed' | 'downloaded' | null>(null);
  const [formError, setFormError] = useState<OrderErrorCode | null>(null);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const order = cart.order;
  const editable = order?.status === 'OPEN';
  const searching = query.trim().length > 0;
  const busy = cart.busy;

  const voice = useVoiceSearch((transcript) => {
    setQuery(transcript);
    setFormError(null);
  }, i18n.language);

  const searchResults = useMemo(
    () => (searching ? filterOrderCatalog(cart.items, section, query) : []),
    [cart.items, query, searching, section],
  );

  // Newest serves first — matches bar POS “just poured” flow.
  const displayLines = order ? [...order.lines].reverse() : [];
  const barLines = displayLines.filter((line) => line.serviceStation === 'bar');
  const kitchenLines = displayLines.filter((line) => line.serviceStation === 'kitchen');
  const serveCount = order?.itemCount ?? 0;
  const runningTotal = order?.totalAmount ?? 0;
  const searchMatches = searching ? searchResults.slice(0, 8) : [];

  const pulseLine = useCallback((lineId: string) => {
    setFocusLineId(lineId);
    const y = rowOffsets.current[lineId];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }
    setTimeout(() => {
      setFocusLineId((current) => (current === lineId ? null : current));
    }, 700);
  }, []);

  const onPickCatalogItem = useCallback(
    (item: StockItem) => {
      setFormError(null);
      void cart.addItem(item.id, 1).then((next) => {
        if (!next) {
          return;
        }
        if (searching) {
          setQuery('');
        }
        const newest = [...next.lines].reverse().find((line) => line.itemId === item.id);
        if (newest) {
          requestAnimationFrame(() => pulseLine(newest.id));
        }
      });
    },
    [cart, pulseLine, searching],
  );

  const onRemoveLine = useCallback(
    (line: OrderLine) => {
      setFormError(null);
      const names = itemNames(line, i18n.language);
      const title = t('billing.removeLineTitle');
      const body = t('billing.removeLineBody', { name: names.primary });
      const remove = () => {
        void cart.setQuantity(line.id, 0);
      };

      // RN Alert button callbacks are unreliable on web — use window.confirm there.
      if (Platform.OS === 'web') {
        if (typeof globalThis !== 'undefined' && globalThis.confirm(`${title}\n\n${body}`)) {
          remove();
        }
        return;
      }

      Alert.alert(title, body, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('billing.removeLine'), style: 'destructive', onPress: remove },
      ]);
    },
    [cart, i18n.language, t],
  );

  const onCancel = useCallback(() => {
    if (order?.status === 'OPEN' && order.lines.length === 0) {
      void cart.release().finally(() => leaveScreen(parent));
      return;
    }
    leaveScreen(parent);
  }, [cart, order, parent]);

  const onPayAndClose = useCallback(() => {
    if (!order || order.lines.length === 0) {
      return;
    }
    billing.clearError();
    setShareNotice(null);
    setPaymentOpen(true);
  }, [billing, order]);

  const onSearchSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFormError('code');
      return;
    }
    const matches = filterOrderCatalog(cart.items, section, trimmed);
    const exact = matches.find(
      (item) =>
        String(item.serialNo) === trimmed || item.itemCode.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) {
      onPickCatalogItem(exact);
      return;
    }
    if (matches.length === 1) {
      onPickCatalogItem(matches[0]);
      return;
    }
    setFormError('code');
  };

  const onCollect = async (payment: { method: PaymentMethod; paidAmount: number }) => {
    if (!order) {
      return;
    }
    try {
      await billing.collectAndClose(order.id, payment);
      setPaymentOpen(false);
      leaveScreen(parent);
    } catch {
      setPaymentOpen(true);
    }
  };

  const buildDraftPreview = billing.draftReceiptPreview;
  const draftPreview = useCallback(
    (method: PaymentMethod) => (order ? buildDraftPreview(order, method) : null),
    [buildDraftPreview, order],
  );

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const title =
    target.kind === 'counter'
      ? t('billing.counterTitle')
      : t('billing.tableTitle', { number: target.kind === 'table' ? target.tableId : (order?.tableId ?? '') });
  const preview = order && order.status === 'PAID' ? billing.receiptPreview(order) : null;

  return (
    <ScreenWrapper padded={false}>
      {cart.isLoading ? (
        <View className="flex-1">
          <ActivityIndicator className="mt-10" color={palette.accent} />
          <View className="flex-1" />
          <ActionRow pinned leading={{ label: t('common.cancel'), onPress: () => leaveScreen(parent) }} />
        </View>
      ) : cart.missing || !order ? (
        <View className="flex-1">
          <View className="px-4 pt-6">
            <Text className="text-body text-muted">{t(cart.errorCode ? `billing.errors.${cart.errorCode}` : 'billing.missing')}</Text>
          </View>
          <View className="flex-1" />
          <ActionRow pinned leading={{ label: t('common.cancel'), onPress: () => leaveScreen(parent) }} />
        </View>
      ) : (
        <View className="flex-1">
          {preview ? (
            <ScrollView className="flex-1" contentContainerClassName="items-center px-2 pb-6">
              <OrderHeader title={title} billId={displayBillNumber(order.sequence)} total={formatInr(order.totalAmount)} />
              {shareNotice === 'failed' ? (
                <Text className="mt-3 self-stretch px-2 text-sm text-danger">{t('billing.shareFailed')}</Text>
              ) : null}
              {shareNotice === 'downloaded' ? (
                <Text className="mt-3 self-stretch px-2 text-sm text-ink">{t('billing.downloaded')}</Text>
              ) : null}
              <View className="mt-4 w-full items-center">
                <ThermalReceipt receipt={preview.receipt} copy={preview.copy} />
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerClassName="px-4 pb-4"
              keyboardShouldPersistTaps="handled"
            >
              <OrderHeader title={title} billId={displayBillNumber(order.sequence)} total={formatInr(runningTotal)} />

              {!editable ? (
                <View className="mt-3 rounded-xl border border-line bg-surface p-3">
                  <Text className="text-sm font-semibold text-ink">{t('billing.closed')}</Text>
                  <Text className="mt-1 text-sm text-muted">
                    {t('billing.paid')} {formatInr(order.paidAmount)}
                    {order.paymentMethod ? ` · ${t(`billing.methods.${order.paymentMethod}`)}` : ''}
                  </Text>
                  {order.isCredit ? (
                    <Text className="mt-1 text-sm font-semibold text-danger">
                      {t('billing.credit')} {formatInr(balancePaise(order.totalAmount, order.paidAmount) / 100)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {shareNotice === 'failed' ? <Text className="mt-2 text-sm text-danger">{t('billing.shareFailed')}</Text> : null}
              {shareNotice === 'downloaded' ? <Text className="mt-2 text-sm text-ink">{t('billing.downloaded')}</Text> : null}

              {editable ? (
                <View className="mt-3">
                  <View className="flex-row rounded-lg border border-line bg-surface p-1">
                    {(['bar', 'kitchen'] as const).map((tab) => {
                      const active = section === tab;
                      return (
                        <Pressable
                          key={tab}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setSection(tab)}
                          className={`h-9 min-w-0 flex-1 items-center justify-center rounded-md ${active ? 'bg-accent' : ''}`}
                        >
                          <Text
                            className={`text-sm font-semibold ${active ? 'text-accent-ink' : 'text-muted'}`}
                            numberOfLines={1}
                          >
                            {t(tab === 'bar' ? 'billing.barItems' : 'billing.kitchenItems')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View className="mt-2 overflow-hidden rounded-lg border border-line bg-surface">
                    <View className="h-11 flex-row items-center px-3">
                      <Ionicons name="search" size={18} color={palette.muted} />
                      <TextInput
                        value={query}
                        onChangeText={(value) => {
                          setQuery(value);
                          setFormError(null);
                        }}
                        onSubmitEditing={() => {
                          void onSearchSubmit();
                        }}
                        returnKeyType="search"
                        placeholder={t('billing.searchPlaceholder')}
                        placeholderTextColor={palette.muted}
                        autoCorrect={false}
                        autoCapitalize="characters"
                        className="mx-2 h-11 min-w-0 flex-1 py-0 text-base text-ink"
                      />
                      {query.length > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('common.cancel')}
                          onPress={() => {
                            setQuery('');
                            setFormError(null);
                          }}
                          className="mr-1 h-8 w-8 items-center justify-center rounded-md"
                        >
                          <Ionicons name="close-circle" size={18} color={palette.muted} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('billing.voiceSearch')}
                        onPress={() => {
                          if (!voice.supported) {
                            Alert.alert(t('billing.voiceUnavailableTitle'), t('billing.voiceUnavailableBody'));
                            return;
                          }
                          voice.toggle();
                        }}
                        className={`h-8 w-8 items-center justify-center rounded-md ${voice.listening ? 'bg-accent' : ''}`}
                      >
                        <Ionicons
                          name={voice.listening ? 'mic' : 'mic-outline'}
                          size={18}
                          color={voice.listening ? palette.accentInk : palette.ink}
                        />
                      </Pressable>
                    </View>

                    {searching ? (
                      <View className="border-t border-line">
                        {searchMatches.length === 0 ? (
                          <Text className="px-3 py-2.5 text-sm text-muted">{t('billing.pickerEmpty')}</Text>
                        ) : (
                          searchMatches.map((item, index) => (
                            <SearchMatchRow
                              key={item.id}
                              item={item}
                              language={i18n.language}
                              busy={busy}
                              showDivider={index < searchMatches.length - 1}
                              onAdd={() => onPickCatalogItem(item)}
                            />
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {formError || cart.errorCode || billing.errorCode ? (
                <Text className="mt-2 text-sm text-danger">
                  {t(`billing.errors.${formError ?? cart.errorCode ?? billing.errorCode}`)}
                </Text>
              ) : null}

              <Text className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {serveCount > 0 ? t('billing.currentOrderCount', { count: serveCount }) : t('billing.currentOrder')}
              </Text>
              {displayLines.length === 0 ? <Text className="py-1 text-sm text-muted">{t('billing.empty')}</Text> : null}
              <View
                className="overflow-hidden rounded-xl border border-line bg-surface"
                onLayout={(event) => {
                  orderSectionOffset.current = event.nativeEvent.layout.y;
                }}
              >
                <OrderStationBlock
                  title={t('billing.barItems')}
                  lines={barLines}
                  language={i18n.language}
                  editable={editable}
                  busy={busy}
                  focusLineId={focusLineId}
                  rowOffsets={rowOffsets}
                  orderSectionOffset={orderSectionOffset}
                  onRemove={onRemoveLine}
                  showTopDivider={false}
                />
                <OrderStationBlock
                  title={t('billing.kitchenItems')}
                  lines={kitchenLines}
                  language={i18n.language}
                  editable={editable}
                  busy={busy}
                  focusLineId={focusLineId}
                  rowOffsets={rowOffsets}
                  orderSectionOffset={orderSectionOffset}
                  onRemove={onRemoveLine}
                  showTopDivider={barLines.length > 0 && kitchenLines.length > 0}
                />
              </View>

            </ScrollView>
          )}

          <View
            className="border-t border-line bg-surface px-4 pt-3"
            style={{ paddingBottom: bottomInset + 12 }}
          >
            {editable ? (
              <View className="flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={onCancel}
                  className="h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-line bg-canvas px-2 disabled:opacity-50"
                >
                  <Text className="text-center text-sm font-semibold text-muted" numberOfLines={1}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || displayLines.length === 0}
                  onPress={onPayAndClose}
                  className="h-12 min-w-0 flex-1 items-center justify-center rounded-lg bg-accent px-2 disabled:opacity-50"
                >
                  <Text className="text-center text-sm font-semibold text-accent-ink" numberOfLines={1}>
                    {t('billing.payClose')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-ink">{t('billing.total')}</Text>
                  <Text className="text-2xl font-bold text-ink">{formatInr(order.totalAmount)}</Text>
                </View>
                <ActionRow
                  className=""
                  leading={{
                    label: t('billing.done'),
                    onPress: () => leaveScreen(parent),
                  }}
                  middle={{
                    label: t('billing.print'),
                    onPress: () => {
                      void billing.printBill(order.id);
                    },
                    disabled: billing.isSubmitting,
                  }}
                  trailing={{
                    label: t('billing.share'),
                    onPress: () => {
                      setShareNotice(null);
                      void billing.shareBill(order.id).then((result) => {
                        if (result === 'downloaded') {
                          setShareNotice('downloaded');
                        } else if (result === 'unopened') {
                          setShareNotice('failed');
                        }
                      });
                    },
                    tone: 'accent',
                    disabled: billing.isSubmitting,
                  }}
                />
              </View>
            )}
          </View>

          <PaymentSheet
            visible={paymentOpen}
            order={order}
            submitting={billing.isSubmitting}
            errorCode={billing.errorCode}
            confirmLabel={target.kind === 'counter' ? t('billing.closeCounter') : t('billing.closeTable')}
            shareNotice={shareNotice}
            draftPreview={draftPreview}
            onClose={() => {
              if (!billing.isSubmitting) {
                setPaymentOpen(false);
                setShareNotice(null);
              }
            }}
            onSubmit={(payment) => {
              void onCollect(payment);
            }}
            onPrint={(preview) => {
              void billing.printPreview(preview);
            }}
            onShare={(preview) => {
              setShareNotice(null);
              void billing.sharePreview(preview).then((result) => {
                if (result === 'downloaded') {
                  setShareNotice('downloaded');
                } else if (result === 'unopened') {
                  setShareNotice('failed');
                }
              });
            }}
          />
        </View>
      )}
    </ScreenWrapper>
  );
}

function OrderHeader({ title, billId, total }: { title: string; billId: string; total: string }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center pt-3">
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text className="mx-2 text-center text-xs text-muted" numberOfLines={1}>
        {t('billing.billHash', { id: billId })}
      </Text>
      <View className="min-w-0 flex-1 items-end">
        <Text className="text-base font-semibold text-accent" numberOfLines={1}>
          {total}
        </Text>
      </View>
    </View>
  );
}

function OrderStationBlock({
  title,
  lines,
  language,
  editable,
  busy,
  focusLineId,
  rowOffsets,
  orderSectionOffset,
  onRemove,
  showTopDivider,
}: {
  title: string;
  lines: OrderLine[];
  language: string;
  editable: boolean;
  busy: boolean;
  focusLineId: string | null;
  rowOffsets: MutableRefObject<Record<string, number>>;
  orderSectionOffset: MutableRefObject<number>;
  onRemove: (line: OrderLine) => void;
  showTopDivider: boolean;
}) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <View className={showTopDivider ? 'border-t border-line' : ''}>
      <Text className="bg-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </Text>
      {lines.map((line, index) => (
        <View
          key={line.id}
          onLayout={(event) => {
            rowOffsets.current[line.id] = orderSectionOffset.current + event.nativeEvent.layout.y;
          }}
        >
          <CompactOrderRow
            line={line}
            language={language}
            editable={editable}
            busy={busy}
            focused={focusLineId === line.id}
            showDivider={index < lines.length - 1}
            onRemove={() => onRemove(line)}
          />
        </View>
      ))}
    </View>
  );
}

function CompactOrderRow({
  line,
  language,
  editable,
  busy,
  focused,
  showDivider,
  onRemove,
}: {
  line: OrderLine;
  language: string;
  editable: boolean;
  busy: boolean;
  focused: boolean;
  showDivider: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const names = itemNames(line, language);
  const volume = volumeMessage(line);
  const lineTotal = lineTotalPaise(line.quantity, line.unitPrice) / 100;

  useEffect(() => {
    if (!focused) {
      pulse.setValue(0);
      return;
    }
    // Native driver is unavailable on web (no RCTAnimation); JS driver is fine for this short pulse.
    const useNativeDriver = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver }),
      Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver }),
    ]).start();
  }, [focused, pulse]);

  return (
    <View className={`relative px-3 py-2.5 ${showDivider ? 'border-b border-line' : ''}`}>
      <Animated.View
        pointerEvents="none"
        style={{
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }),
          backgroundColor: palette.accent,
        }}
        className="absolute inset-0"
      />
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 pr-1">
          <Text className="text-sm font-bold text-ink" numberOfLines={1}>
            {line.itemCode} • {names.primary}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {t(volume.key, volume.values)}
            {line.quantity > 1 ? ` · ×${line.quantity}` : ''}
          </Text>
        </View>
        <Text className="min-w-[72px] text-right text-sm font-bold text-ink">{formatInr(lineTotal)}</Text>
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('billing.removeLine')}
            disabled={busy}
            onPress={onRemove}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-md border border-line bg-canvas"
          >
            <Ionicons name="trash-outline" size={18} color={palette.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SearchMatchRow({
  item,
  language,
  busy,
  showDivider,
  onAdd,
}: {
  item: StockItem;
  language: string;
  busy: boolean;
  showDivider: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const names = itemNames(item, language);
  const volume = volumeMessage(item);
  const out = item.currentStock <= 0;

  return (
    <View className={`flex-row items-center gap-2 px-3 py-2 ${showDivider ? 'border-b border-line' : ''}`}>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-ink" numberOfLines={1}>
          #{item.serialNo} · {item.itemCode} · {names.primary}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {t(volume.key, volume.values)} · {formatInr(item.sellingPrice)}
          {out ? ` · ${t('billing.out')}` : ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('billing.add')}
        disabled={busy || out}
        onPress={onAdd}
        className="h-9 min-w-[64px] items-center justify-center rounded-md bg-accent px-3 disabled:opacity-50"
      >
        <Text className="text-sm font-semibold text-accent-ink">{t('billing.add')}</Text>
      </Pressable>
    </View>
  );
}
