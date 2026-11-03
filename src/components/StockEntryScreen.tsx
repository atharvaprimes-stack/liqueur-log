import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ItemPickerModal } from './ItemPickerModal';
import { SaveRow } from './FormActions';
import { FormScreen } from './FormScreen';
import { leaveScreen } from '../navigation/leave';
import { ScreenWrapper } from './ScreenWrapper';
import { SupplierPicker } from './SupplierPicker';
import { useAuth } from '../context/AuthContext';
import { inventoryErrorCode } from '../domain/errors';
import {
  isDefaultSupplierName,
  PAYMENT_TYPES,
  summarizeDraft,
  type DraftLine,
  type PaymentType,
  type StockItem,
} from '../domain/models/inventory';
import {
  formatInrFromPaise,
  formatRupeeInput,
  parseQuantity,
  parseRupeeToPaise,
  sanitizeQuantityInput,
  sanitizeRupeeInput,
} from '../domain/money';
import { useVendors } from '../hooks/useCatalog';
import { useInventory } from '../hooks/useInventory';
import { useTheme } from '../theme/theme-context';

function makeLine(item: StockItem, prior?: DraftLine): DraftLine {
  return {
    itemId: item.id,
    quantity: prior?.quantity ?? '',
    unitPrice: prior?.unitPrice ?? formatRupeeInput(item.purchasePrice),
  };
}

function parseItemIdParams(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  const parts = Array.isArray(value) ? value.flatMap((entry) => entry.split(',')) : value.split(',');
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of parts) {
    const id = part.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function StockEntryScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { items, isLoading, errorCode, savePurchase, suggestNextInvoice } = useInventory();
  const { vendors, isLoading: vendorsLoading } = useVendors();
  const params = useLocalSearchParams<{ itemIds?: string | string[]; itemId?: string | string[] }>();
  const seededKey = useRef<string | null>(null);
  /** Tracks which supplier the current auto-suggested invoice belongs to. */
  const invoiceForSupplierKey = useRef<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | null>('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeDraft(lines), [lines]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const seedItemIds = useMemo(() => parseItemIdParams(params.itemIds ?? params.itemId), [params.itemId, params.itemIds]);
  const vendor = vendors.find((entry) => entry.id === vendorId) ?? null;
  const paidPaise = useMemo(() => {
    if (paymentType === 'Cash') {
      return summary.totalPaise;
    }
    if (paymentType === 'Credit') {
      return 0;
    }
    if (paymentType === 'Partial') {
      return parseRupeeToPaise(amountPaid);
    }
    return null;
  }, [amountPaid, paymentType, summary.totalPaise]);
  const creditPaise =
    paymentType === 'Partial' && paidPaise !== null && paidPaise >= 0
      ? Math.max(summary.totalPaise - paidPaise, 0)
      : paymentType === 'Credit'
        ? summary.totalPaise
        : 0;

  useEffect(() => {
    if (vendorId && !vendors.some((entry) => entry.id === vendorId)) {
      setVendorId(null);
      return;
    }
    // Prefer catch-all "NA" on first load; do not auto-pick an arbitrary single vendor.
    if (!vendorId && vendors.length > 0) {
      const defaultVendor = vendors.find((entry) => isDefaultSupplierName(entry.name));
      if (defaultVendor) {
        setVendorId(defaultVendor.id);
      }
    }
  }, [vendorId, vendors]);

  useEffect(() => {
    if (!vendor) {
      invoiceForSupplierKey.current = null;
      return;
    }
    const supplierKey = vendor.name.trim().toLowerCase();
    if (invoiceForSupplierKey.current === supplierKey) {
      return;
    }
    invoiceForSupplierKey.current = supplierKey;
    let active = true;
    void suggestNextInvoice(vendor.name)
      .then((next) => {
        if (active) {
          setInvoiceNumber(next);
        }
      })
      .catch(() => {
        if (active) {
          setInvoiceNumber('1');
        }
      });
    return () => {
      active = false;
    };
  }, [suggestNextInvoice, vendor]);

  useEffect(() => {
    if (seedItemIds.length === 0) {
      return;
    }
    const key = seedItemIds.join(',');
    if (seededKey.current === key) {
      return;
    }
    const seeded = seedItemIds.flatMap((id) => {
      const item = itemsById.get(id);
      return item ? [makeLine(item)] : [];
    });
    if (seeded.length === 0) {
      return;
    }
    seededKey.current = key;
    setLines((current) => {
      const byId = new Map(current.map((line) => [line.itemId, line]));
      return seeded.map((line) => makeLine(itemsById.get(line.itemId)!, byId.get(line.itemId)));
    });
  }, [itemsById, seedItemIds]);

  if (!isReady) {
    return null;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  if (currentUser.role !== 'ADMIN') {
    return <Redirect href="/stock" />;
  }

  const updateLine = (lineItemId: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.itemId === lineItemId ? { ...line, ...patch } : line)));
  };

  const removeLine = (lineItemId: string) => {
    setLines((current) => current.filter((entry) => entry.itemId !== lineItemId));
  };

  const appendPickerLines = (added: DraftLine[]) => {
    setLines((current) => {
      const existingIds = new Set(current.map((line) => line.itemId));
      const fresh = added.filter((line) => !existingIds.has(line.itemId));
      if (fresh.length === 0) {
        return current;
      }
      return [...current, ...fresh];
    });
    setPickerOpen(false);
  };

  const onSave = async () => {
    if (saving || saved) {
      return;
    }

    const supplier = vendor?.name.trim() ?? '';
    const invoice = invoiceNumber.trim();
    if (!supplier) {
      setFormError('supplier');
      return;
    }
    if (!invoice) {
      setFormError('invoice');
      return;
    }
    if (!paymentType) {
      setFormError('payment');
      return;
    }
    if (!summary.complete) {
      setFormError(summary.issue ?? 'lines');
      return;
    }
    if (paymentType === 'Partial') {
      const paid = parseRupeeToPaise(amountPaid);
      if (paid === null || paid <= 0 || paid >= summary.totalPaise) {
        setFormError('amount-paid');
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      await savePurchase({
        supplierName: supplier,
        invoiceNumber,
        paymentType,
        amountPaid: paymentType === 'Partial' ? amountPaid : undefined,
        lines,
      });
      setSaved(true);
    } catch (error) {
      setFormError(inventoryErrorCode(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper padded={false}>
      <FormScreen
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        bottomOffset={160}
        footer={
          <View className="border-t border-line bg-surface px-4 py-3">
            {saved ? (
              <View>
                <Text className="text-base font-semibold text-ink">{t('stock.purchase.savedTitle')}</Text>
                <Text className="mt-1 text-sm text-muted">
                  {t('stock.purchase.savedBody', { invoice: invoiceNumber.trim() })}
                </Text>
                {paymentType === 'Credit' || paymentType === 'Partial' ? (
                  <Text className="mt-1 text-sm text-muted">{t('stock.purchase.creditNote')}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => leaveScreen('/stock')}
                  className="mt-3 h-12 items-center justify-center rounded-lg bg-accent"
                >
                  <Text className="text-base font-semibold text-accent-ink">{t('stock.purchase.ok')}</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <View className="mb-2 flex-row items-end justify-between gap-3">
                  <Text className="text-sm font-semibold text-muted">{t('stock.purchase.total')}</Text>
                  <Text className="text-title font-bold text-ink">{formatInrFromPaise(summary.totalPaise)}</Text>
                </View>
                {paymentType === 'Cash' ? (
                  <Text className="mb-1 text-sm font-semibold text-success">
                    {t('stock.purchase.paid')}: {formatInrFromPaise(summary.totalPaise)}
                  </Text>
                ) : null}
                {paymentType === 'Credit' ? (
                  <Text className="mb-1 text-sm text-muted">
                    {t('stock.purchase.due')}: {formatInrFromPaise(summary.totalPaise)}
                  </Text>
                ) : null}
                {paymentType === 'Partial' && paidPaise !== null ? (
                  <View className="mb-1 gap-0.5">
                    <Text className="text-sm font-semibold text-success">
                      {t('stock.purchase.paid')}: {formatInrFromPaise(paidPaise)}
                    </Text>
                    <Text className="text-sm text-muted">
                      {t('stock.purchase.due')}: {formatInrFromPaise(creditPaise)}
                    </Text>
                  </View>
                ) : null}
                {summary.issue ? <Text className="mb-2 text-sm text-danger">{t(`stock.errors.${summary.issue}`)}</Text> : null}
                {formError ? <Text className="mb-2 text-sm text-danger">{t(`stock.errors.${formError}`)}</Text> : null}
                <SaveRow
                  parent="/stock"
                  className="mt-1"
                  saveLabel={t('stock.purchase.save')}
                  saving={saving}
                  onSave={() => {
                    void onSave();
                  }}
                />
              </View>
            )}
          </View>
        }
      >
          <View>
            <Text className="text-display font-semibold text-ink">{t('stock.purchase.title')}</Text>
            <Text className="mt-1 text-body text-muted">{t('stock.purchase.subtitleBlank')}</Text>
            {errorCode ? <Text className="mt-3 text-sm text-danger">{t(`stock.errors.${errorCode}`)}</Text> : null}
          </View>

          <View className="overflow-hidden rounded-xl border border-line bg-surface">
            <View className="gap-3 border-b border-line p-3">
              <View>
                <Text className="mb-1.5 text-xs font-semibold text-muted">{t('stock.purchase.supplier')}</Text>
                {vendorsLoading ? (
                  <View className="h-11 items-center justify-center rounded-lg border border-line bg-canvas">
                    <ActivityIndicator color={palette.accent} />
                  </View>
                ) : vendors.length === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/menu/vendors')}
                    className="h-11 items-center justify-center rounded-lg border border-dashed border-line bg-canvas px-2"
                  >
                    <Text className="text-sm font-semibold text-accent">{t('stock.purchase.addVendor')}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setVendorPickerOpen(true)}
                    className="h-11 justify-center rounded-lg border border-line bg-canvas px-3"
                  >
                    <Text className={`text-sm ${vendor ? 'text-ink' : 'text-muted'}`} numberOfLines={1}>
                      {vendor ? vendor.name : t('stock.purchase.supplierPlaceholder')}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View>
                <Text className="mb-1.5 text-xs font-semibold text-muted">{t('stock.purchase.invoice')}</Text>
                <TextInput
                  value={invoiceNumber}
                  onChangeText={(value) => {
                    setInvoiceNumber(value);
                    setFormError(null);
                  }}
                  placeholder={t('stock.purchase.invoicePlaceholder')}
                  placeholderTextColor={palette.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
                />
              </View>
            </View>

            <View className="p-3">
              <Text className="mb-1.5 text-xs font-semibold text-muted">{t('stock.purchase.payment')}</Text>
              <View className="flex-row gap-1 rounded-lg bg-canvas p-1">
                {PAYMENT_TYPES.map((type) => {
                  const selected = paymentType === type;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setPaymentType(type);
                        if (type !== 'Partial') {
                          setAmountPaid('');
                        }
                        setFormError(null);
                      }}
                      className={`h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-1 ${
                        selected ? 'bg-accent' : ''
                      }`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}
                      >
                        {t(`stock.paymentTypes.${type}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {paymentType === 'Partial' ? (
                <View className="mt-3">
                  <Text className="mb-1.5 text-xs font-semibold text-muted">{t('stock.purchase.amountPaid')}</Text>
                  <TextInput
                    value={amountPaid}
                    onChangeText={(value) => {
                      setAmountPaid(sanitizeRupeeInput(value));
                      setFormError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder={t('stock.purchase.amountPaidPlaceholder')}
                    placeholderTextColor={palette.muted}
                    className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
                  />
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-sm text-muted">{t('stock.purchase.creditBalance')}</Text>
                    <Text className="text-sm font-semibold text-ink">{formatInrFromPaise(creditPaise)}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <View>
            <View className="mb-2 flex-row items-center justify-between gap-2">
              <Text className="text-body font-semibold text-ink">{t('stock.purchase.items')}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading || items.length === 0}
                onPress={() => setPickerOpen(true)}
                className="h-10 flex-row items-center gap-1.5 rounded-lg border border-line bg-surface px-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <ActivityIndicator color={palette.accent} />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color={palette.ink} />
                    <Text className="text-sm font-semibold text-ink">{t('stock.purchase.addMoreItems')}</Text>
                  </>
                )}
              </Pressable>
            </View>

            {lines.length === 0 ? (
              <View className="rounded-xl border border-dashed border-line bg-surface px-4 py-6">
                <Text className="text-center text-body text-muted">{t('stock.purchase.emptyLines')}</Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-xl border border-line bg-surface">
                <View className="flex-row items-center gap-2 border-b border-line bg-canvas px-3 py-2">
                  <Text className="min-w-0 flex-[1.6] text-[11px] font-semibold uppercase text-muted">
                    {t('stock.purchase.colItem')}
                  </Text>
                  <Text className="w-14 text-center text-[11px] font-semibold uppercase text-muted">
                    {t('stock.purchase.quantityShort')}
                  </Text>
                  <Text className="w-[72px] text-center text-[11px] font-semibold uppercase text-muted">
                    {t('stock.purchase.costShort')}
                  </Text>
                  <Text className="w-[72px] text-right text-[11px] font-semibold uppercase text-muted">
                    {t('stock.purchase.lineTotal')}
                  </Text>
                  <View className="w-8" />
                </View>
                {lines.map((line, index) => {
                  const item = itemsById.get(line.itemId);
                  if (!item) {
                    return null;
                  }
                  return (
                    <ItemTableRow
                      key={line.itemId}
                      item={item}
                      line={line}
                      showDivider={index < lines.length - 1}
                      onChange={updateLine}
                      onRemove={() => removeLine(line.itemId)}
                    />
                  );
                })}
              </View>
            )}
          </View>
      </FormScreen>

      <SupplierPicker
        visible={vendorPickerOpen}
        vendors={vendors}
        selectedId={vendorId}
        onClose={() => setVendorPickerOpen(false)}
        onSelect={(nextId) => {
          // Reset invoice tracking so changing supplier reloads that supplier's next bill number.
          if (nextId !== vendorId) {
            invoiceForSupplierKey.current = null;
          }
          setVendorId(nextId);
          setVendorPickerOpen(false);
          setFormError(null);
        }}
      />

      <ItemPickerModal
        visible={pickerOpen}
        items={items}
        existingItemIds={lines.map((line) => line.itemId)}
        onClose={() => setPickerOpen(false)}
        onAdd={appendPickerLines}
      />
    </ScreenWrapper>
  );
}

const COMPACT_INPUT_STYLE = {
  paddingVertical: 0,
  textAlignVertical: 'center' as const,
  includeFontPadding: false,
};

function ItemTableRow({
  item,
  line,
  showDivider,
  onChange,
  onRemove,
}: {
  item: StockItem;
  line: DraftLine;
  showDivider: boolean;
  onChange: (itemId: string, patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const quantity = parseQuantity(line.quantity);
  const paise = parseRupeeToPaise(line.unitPrice);
  const linePaise = quantity !== null && paise !== null ? quantity * paise : null;

  return (
    <View className={`flex-row items-center gap-2 px-3 py-2.5 ${showDivider ? 'border-b border-line' : ''}`}>
      <View className="min-w-0 flex-[1.6] justify-center">
        <Text className="text-sm font-bold text-ink" numberOfLines={1}>
          #{item.serialNo}
        </Text>
      </View>
      <TextInput
        value={line.quantity}
        onChangeText={(value) => onChange(item.id, { quantity: sanitizeQuantityInput(value) })}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={palette.muted}
        accessibilityLabel={t('stock.purchase.quantity')}
        className="h-11 w-14 rounded-lg border border-line bg-canvas px-1 text-center text-sm text-ink"
        style={COMPACT_INPUT_STYLE}
      />
      <TextInput
        value={line.unitPrice}
        onChangeText={(value) => onChange(item.id, { unitPrice: sanitizeRupeeInput(value) })}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={palette.muted}
        accessibilityLabel={t('stock.purchase.cost')}
        className="h-11 w-[72px] rounded-lg border border-line bg-canvas px-1 text-center text-sm text-ink"
        style={COMPACT_INPUT_STYLE}
      />
      <Text className="w-[72px] text-right text-sm font-semibold text-ink" numberOfLines={1}>
        {linePaise === null ? '—' : formatInrFromPaise(linePaise)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('stock.purchase.remove')}
        onPress={onRemove}
        hitSlop={6}
        className="h-11 w-8 items-center justify-center"
      >
        <Ionicons name="trash-outline" size={18} color={palette.danger} />
      </Pressable>
    </View>
  );
}
