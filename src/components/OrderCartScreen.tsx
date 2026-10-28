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
import { formatInr, parseQuantity, sanitizeQuantityInput } from '../domain/money';
import {
  filterOrderCatalog,
  itemNames,
  tracksStock,
  volumeMessage,
  type OrderCatalogSection,
  type StockItem,
} from '../domain/models/inventory';
import { balancePaise, type OrderLine, type PaymentMethod } from '../domain/models/orders';
import type { TableRequest } from '../domain/models/tableRequests';
import { useBilling } from '../hooks/useBilling';
import { useOrderCart, type CartTarget } from '../hooks/useOrderCart';
import { useTableRequests } from '../hooks/useTableRequests';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { useAuth } from '../context/AuthContext';
import { useBottomInset } from '../navigation/bottomInset';
import { leaveScreen } from '../navigation/leave';
import { afterModalDismissed } from '../printing/receiptFile';
import { useTheme } from '../theme/theme-context';
import { ActionRow } from './FormActions';
import { PaymentSheet } from './PaymentSheet';
import { QuantityNumpadSheet } from './QuantityNumpadSheet';
import { RemoveQuantitySheet } from './RemoveQuantitySheet';
import { ScreenWrapper } from './ScreenWrapper';
import { ThermalReceipt } from './ThermalReceipt';

export function OrderCartScreen({ target, parent }: { target: CartTarget; parent: Href }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const bottomInset = useBottomInset();
  const cart = useOrderCart(target);
  const billing = useBilling();
  const tableRequests = useTableRequests();
  const scrollRef = useRef<ScrollView>(null);
  const orderSectionOffset = useRef(0);
  const rowOffsets = useRef<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<OrderCatalogSection>('bar');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<'failed' | 'downloaded' | 'printFailed' | null>(null);
  const [formError, setFormError] = useState<OrderErrorCode | null>(null);
  const [requestNotice, setRequestNotice] = useState(false);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [removingLine, setRemovingLine] = useState<{ line: OrderLine; available: number } | null>(
    null,
  );
  const order = cart.order;
  const editable = order?.status === 'OPEN';
  const searching = query.trim().length > 0;
  const busy = cart.busy;
  const tableId = target.kind === 'table' ? target.tableId : order?.tableId;
  const pendingRequests =
    editable && tableId ? tableRequests.pendingForTable(tableId) : [];

  const voice = useVoiceSearch((transcript) => {
    setQuery(transcript);
    setFormError(null);
  }, i18n.language);

  // Tab badges: full section totals, or match counts while searching.
  const sectionCounts = useMemo(
    () => ({
      bar: filterOrderCatalog(cart.items, 'bar', query).length,
      kitchen: filterOrderCatalog(cart.items, 'kitchen', query).length,
    }),
    [cart.items, query],
  );

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
  const editingVolume = editingLine ? volumeMessage(editingLine) : null;

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
    (item: StockItem, quantity = 1) => {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
        setFormError('quantity');
        return;
      }
      setFormError(null);
      setAddingItemId(item.id);
      void cart
        .addItem(item.id, quantity)
        .then((next) => {
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
        })
        .finally(() => {
          setAddingItemId((current) => (current === item.id ? null : current));
        });
    },
    [cart, pulseLine, searching],
  );

  const unitsOnOrder = useCallback(
    (itemId: string) =>
      (order?.lines ?? [])
        .filter((entry) => entry.itemId === itemId)
        .reduce((sum, entry) => sum + entry.quantity, 0),
    [order?.lines],
  );

  const onEditLineQuantity = useCallback(
    (quantity: number) => {
      if (!editingLine) {
        return;
      }
      const lineId = editingLine.id;
      setEditingLine(null);
      setFormError(null);
      void cart.setQuantity(lineId, quantity).then((next) => {
        if (!next) {
          return;
        }
        requestAnimationFrame(() => pulseLine(lineId));
      });
    },
    [cart, editingLine, pulseLine],
  );

  const onConfirmRemoveUnits = useCallback(
    (quantity: number) => {
      if (!removingLine) {
        return;
      }
      const { line } = removingLine;
      setRemovingLine(null);
      setFormError(null);
      void cart.removeUnits(line.itemId, quantity, line.id);
    },
    [cart, removingLine],
  );

  const onRemoveLine = useCallback(
    (line: OrderLine) => {
      setFormError(null);
      const available = unitsOnOrder(line.itemId);
      if (available > 1) {
        setRemovingLine({ line, available });
        return;
      }

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
    [cart, i18n.language, t, unitsOnOrder],
  );

  const onCancel = useCallback(() => {
    if (order?.status === 'OPEN' && order.lines.length === 0) {
      const closingTableId = order.orderType === 'TABLE' ? order.tableId : null;
      void cart
        .release()
        .then((released) => {
          if (released && closingTableId) {
            void tableRequests.closeForTable(closingTableId);
          }
        })
        .finally(() => leaveScreen(parent));
      return;
    }
    leaveScreen(parent);
  }, [cart, order, parent, tableRequests]);

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
      if (order.orderType === 'TABLE' && order.tableId) {
        void tableRequests.closeForTable(order.tableId);
      }
      setPaymentOpen(false);
      leaveScreen(parent);
    } catch {
      setPaymentOpen(true);
    }
  };

  const onAcceptRequest = useCallback(
    async (request: TableRequest) => {
      if (!editable || busy || requestBusyId) {
        return;
      }
      setRequestNotice(false);
      setRequestBusyId(request.id);
      try {
        // Accept = add to CURRENT ORDER, then close the incoming request.
        const next = await cart.addItem(request.itemId, request.quantity);
        if (!next) {
          setRequestNotice(true);
          return;
        }
        await tableRequests.acceptRequest(request.id);
        const newest = [...next.lines].reverse().find((line) => line.itemId === request.itemId);
        if (newest) {
          requestAnimationFrame(() => pulseLine(newest.id));
        }
      } finally {
        setRequestBusyId(null);
      }
    },
    [busy, cart, editable, pulseLine, requestBusyId, tableRequests],
  );

  const onRejectRequest = useCallback(
    async (request: TableRequest) => {
      if (!editable || busy || requestBusyId) {
        return;
      }
      setRequestNotice(false);
      setRequestBusyId(request.id);
      try {
        // Reject = dismiss only; never add to CURRENT ORDER.
        const synced = await tableRequests.rejectRequest(request.id);
        if (!synced) {
          setRequestNotice(true);
        }
      } finally {
        setRequestBusyId(null);
      }
    },
    [busy, editable, requestBusyId, tableRequests],
  );

  const onAcceptAllRequests = useCallback(async () => {
    if (!editable || busy || requestBusyId || pendingRequests.length === 0) {
      return;
    }
    setRequestNotice(false);
    setRequestBusyId('all');
    try {
      const acceptedIds: string[] = [];
      let lastOrder = cart.order;
      for (const request of pendingRequests) {
        const next = await cart.addItem(request.itemId, request.quantity);
        if (!next) {
          setRequestNotice(true);
          break;
        }
        acceptedIds.push(request.id);
        lastOrder = next;
      }
      if (acceptedIds.length === 0) {
        return;
      }
      await tableRequests.acceptRequests(acceptedIds);
      const newest = lastOrder ? [...lastOrder.lines].reverse()[0] : null;
      if (newest) {
        requestAnimationFrame(() => pulseLine(newest.id));
      }
    } finally {
      setRequestBusyId(null);
    }
  }, [busy, cart, editable, pendingRequests, pulseLine, requestBusyId, tableRequests]);

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
                      const count = tab === 'bar' ? sectionCounts.bar : sectionCounts.kitchen;
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
                            {t(tab === 'bar' ? 'billing.barItems' : 'billing.kitchenItems')} ({count})
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
                              adding={addingItemId === item.id}
                              showDivider={index < searchMatches.length - 1}
                              onAdd={(quantity) => onPickCatalogItem(item, quantity)}
                              onQuantityError={() => setFormError('quantity')}
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
              {requestNotice ? (
                <Text className="mt-2 text-sm text-danger">
                  {t(cart.errorCode ? 'billing.requestAddFailed' : 'billing.requestUpdateFailed')}
                </Text>
              ) : null}

              {editable && pendingRequests.length > 0 ? (
                <IncomingRequestsPanel
                  requests={pendingRequests}
                  language={i18n.language}
                  busy={busy || requestBusyId !== null}
                  busyId={requestBusyId}
                  onAccept={(request) => {
                    void onAcceptRequest(request);
                  }}
                  onReject={(request) => {
                    void onRejectRequest(request);
                  }}
                  onAcceptAll={() => {
                    void onAcceptAllRequests();
                  }}
                />
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
                  onEdit={(line) => setEditingLine(line)}
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
                  onEdit={(line) => setEditingLine(line)}
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
                        } else if (result === 'unopened' || result === 'error') {
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
            shareNotice={shareNotice === 'printFailed' ? 'printFailed' : null}
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
            onPrint={(preview, payment) => {
              void (async () => {
                setShareNotice(null);
                // Native PrintManager sits under RN Modal; Android resolves as soon as
                // the dialog opens, so keep the sheet closed afterward.
                setPaymentOpen(false);
                await afterModalDismissed();
                const ok = await billing.printPreview(preview);
                if (!ok) {
                  setPaymentOpen(true);
                  setShareNotice('printFailed');
                  return;
                }
                // Successful bill print settles the order (counter + table).
                await onCollect(payment);
              })();
            }}
          />

          <QuantityNumpadSheet
            visible={editingLine !== null}
            title={
              editingLine
                ? `${editingLine.itemCode} · ${itemNames(editingLine, i18n.language).primary}`
                : ''
            }
            subtitle={editingVolume ? t(editingVolume.key, editingVolume.values) : undefined}
            initialQuantity={editingLine?.quantity ?? 1}
            confirmLabel={t('billing.quantityUpdate')}
            onClose={() => setEditingLine(null)}
            onConfirm={onEditLineQuantity}
          />

          <RemoveQuantitySheet
            visible={removingLine !== null}
            title={
              removingLine
                ? `${removingLine.line.itemCode} · ${itemNames(removingLine.line, i18n.language).primary}`
                : ''
            }
            available={removingLine?.available ?? 1}
            onClose={() => setRemovingLine(null)}
            onConfirm={onConfirmRemoveUnits}
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

function IncomingRequestsPanel({
  requests,
  language,
  busy,
  busyId,
  onAccept,
  onReject,
  onAcceptAll,
}: {
  requests: TableRequest[];
  language: string;
  busy: boolean;
  busyId: string | null;
  onAccept: (request: TableRequest) => void;
  onReject: (request: TableRequest) => void;
  onAcceptAll: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();

  return (
    <View className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
      <View
        className="flex-row items-center justify-between gap-2 border-b border-line px-3 py-2.5"
        style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)' }}
      >
        <Text className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-ink">
          {t('billing.incomingRequestsCount', { count: requests.length })}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onAcceptAll}
          className="h-8 items-center justify-center rounded-md bg-accent px-2.5 disabled:opacity-50"
        >
          {busyId === 'all' ? (
            <ActivityIndicator color={palette.accentInk} size="small" />
          ) : (
            <Text className="text-xs font-bold text-accent-ink">{t('billing.acceptAllRequests')}</Text>
          )}
        </Pressable>
      </View>

      {requests.map((request, index) => {
        const names = itemNames(request, language);
        const rowBusy = busyId === request.id;
        return (
          <View
            key={request.id}
            className={`px-3 py-2.5 ${index < requests.length - 1 ? 'border-b border-line' : ''}`}
          >
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                  {names.primary}
                </Text>
                <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                  {t('billing.requestQty', { count: request.quantity })} · {formatInr(request.unitPrice)}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-ink">
                {formatInr(Math.round(request.quantity * request.unitPrice * 100) / 100)}
              </Text>
            </View>
            <View className="mt-2 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onReject(request)}
                className="h-9 min-w-0 flex-1 items-center justify-center rounded-lg border border-line bg-canvas disabled:opacity-50"
              >
                {rowBusy ? (
                  <ActivityIndicator color={palette.muted} size="small" />
                ) : (
                  <Text className="text-xs font-semibold text-muted">{t('billing.rejectRequest')}</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onAccept(request)}
                className="h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
              >
                {rowBusy ? (
                  <ActivityIndicator color={palette.accentInk} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-accent-ink">{t('billing.acceptRequest')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
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
  onEdit,
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
  onEdit: (line: OrderLine) => void;
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
            onEdit={() => onEdit(line)}
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
  onEdit,
  onRemove,
}: {
  line: OrderLine;
  language: string;
  editable: boolean;
  busy: boolean;
  focused: boolean;
  showDivider: boolean;
  onEdit: () => void;
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('billing.quantityEdit')}
          disabled={!editable || busy}
          onPress={onEdit}
          className="min-w-0 flex-1 flex-row items-center gap-2 pr-1 disabled:opacity-100"
        >
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink" numberOfLines={1}>
              {line.itemCode} • {names.primary}
            </Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {t(volume.key, volume.values)}
              {line.quantity > 1 ? ` · ×${line.quantity}` : ''}
            </Text>
          </View>
          <Text className="min-w-[72px] text-right text-sm font-bold text-ink">{formatInr(lineTotal)}</Text>
        </Pressable>
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
  adding,
  showDivider,
  onAdd,
  onQuantityError,
}: {
  item: StockItem;
  language: string;
  busy: boolean;
  adding: boolean;
  showDivider: boolean;
  onAdd: (quantity: number) => void;
  onQuantityError: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [qtyInput, setQtyInput] = useState('1');
  const names = itemNames(item, language);
  const volume = volumeMessage(item);
  const out = tracksStock(item) && item.currentStock <= 0;

  const submitAdd = () => {
    const trimmed = qtyInput.trim();
    const quantity = trimmed === '' ? 1 : parseQuantity(trimmed);
    if (quantity === null) {
      onQuantityError();
      return;
    }
    onAdd(quantity);
  };

  return (
    <View className={`flex-row items-center gap-2 px-3 py-2 ${showDivider ? 'border-b border-line' : ''}`}>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-ink" numberOfLines={1}>
          #{item.serialNo} · {names.primary}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {t(volume.key, volume.values)} · {formatInr(item.sellingPrice)}
        </Text>
      </View>
      <View className="h-9 w-14 justify-center rounded-md border border-line bg-canvas px-1.5">
        <TextInput
          value={qtyInput}
          onChangeText={(value) => setQtyInput(sanitizeQuantityInput(value))}
          onBlur={() => {
            if (qtyInput.trim() === '') {
              setQtyInput('1');
            }
          }}
          onSubmitEditing={submitAdd}
          editable={!busy && !out}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={4}
          returnKeyType="done"
          accessibilityLabel={t('billing.quantity')}
          placeholder="1"
          placeholderTextColor={palette.muted}
          className="h-9 w-full py-0 text-center text-sm font-bold text-ink"
          style={{ margin: 0, padding: 0 }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={out ? t('billing.out') : t('billing.add')}
        accessibilityState={{ disabled: busy || out }}
        disabled={busy || out}
        onPress={submitAdd}
        className={`h-9 min-w-[64px] items-center justify-center rounded-md bg-accent px-3 ${
          out || adding ? 'opacity-50' : ''
        }`}
      >
        <Text className="text-sm font-semibold text-accent-ink">{t('billing.add')}</Text>
      </Pressable>
    </View>
  );
}
