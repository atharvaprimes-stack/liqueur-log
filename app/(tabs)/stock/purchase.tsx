import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ItemPickerModal } from '../../../src/components/ItemPickerModal';
import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { inventoryErrorCode } from '../../../src/domain/errors';
import {
  itemNames,
  PAYMENT_TYPES,
  summarizeDraft,
  volumeMessage,
  type DraftLine,
  type PaymentType,
  type StockItem,
} from '../../../src/domain/models/inventory';
import {
  formatInrFromPaise,
  formatRupeeInput,
  parseQuantity,
  parseRupeeToPaise,
  sanitizeQuantityInput,
  sanitizeRupeeInput,
} from '../../../src/domain/money';
import { useInventory } from '../../../src/hooks/useInventory';
import { useTheme } from '../../../src/theme/theme-context';

export default function PurchaseScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { items, isLoading, errorCode, savePurchase } = useInventory();
  const { itemId } = useLocalSearchParams<{ itemId?: string | string[] }>();
  const seededItemId = useRef<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeDraft(lines), [lines]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const requestedItemId = Array.isArray(itemId) ? itemId[0] : itemId;

  useEffect(() => {
    if (!requestedItemId || seededItemId.current === requestedItemId) {
      return;
    }
    const item = itemsById.get(requestedItemId);
    if (!item) {
      return;
    }
    seededItemId.current = requestedItemId;
    setLines((current) => {
      if (current.some((line) => line.itemId === item.id)) {
        return current;
      }
      return [
        { itemId: item.id, quantity: '', unitPrice: formatRupeeInput(item.purchasePrice) },
        ...current,
      ];
    });
  }, [itemsById, requestedItemId]);

  if (!isReady) {
    return null;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  if (currentUser.role !== 'ADMIN') {
    return <Redirect href="/stock" />;
  }

  const updateLine = (itemId: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));
  };

  const onSave = async () => {
    if (saving || saved) {
      return;
    }

    const supplier = supplierName.trim();
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

    setSaving(true);
    setFormError(null);
    try {
      await savePurchase({
        supplierName,
        invoiceNumber,
        paymentType,
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
    <ScreenWrapper showBackButton padded={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="text-display font-semibold text-ink">{t('stock.purchase.title')}</Text>
          <Text className="mt-2 text-body text-muted">{t('stock.purchase.subtitle')}</Text>
          {errorCode ? <Text className="mt-4 text-sm text-danger">{t(`stock.errors.${errorCode}`)}</Text> : null}

          <FieldLabel step="1" label={t('stock.purchase.supplier')} />
          <TextInput
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder={t('stock.purchase.supplierPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="words"
            className="h-14 rounded-2xl border border-line bg-surface px-4 text-body text-ink"
          />

          <FieldLabel step="2" label={t('stock.purchase.invoice')} />
          <TextInput
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            placeholder={t('stock.purchase.invoicePlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            className="h-14 rounded-2xl border border-line bg-surface px-4 text-body text-ink"
          />

          <FieldLabel step="3" label={t('stock.purchase.payment')} />
          {PAYMENT_TYPES.map((type) => {
            const selected = paymentType === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPaymentType(type)}
                className={`mb-3 min-h-[72px] justify-center rounded-lg border px-4 py-3 ${
                  selected ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text className={`text-body font-bold ${selected ? 'text-accent-ink' : 'text-ink'}`}>
                  {t(`stock.paymentTypes.${type}`)}
                </Text>
                <Text className={`text-sm ${selected ? 'text-accent-ink' : 'text-muted'}`}>
                  {t(`stock.purchase.paymentHint.${type}`)}
                </Text>
              </Pressable>
            );
          })}

          <FieldLabel step="4" label={t('stock.purchase.items')} />
          <Pressable
            accessibilityRole="button"
            disabled={isLoading || items.length === 0}
            onPress={() => setPickerOpen(true)}
            className="h-14 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
          >
            {isLoading ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text className="text-body font-semibold text-accent-ink">{t('stock.purchase.addItems')}</Text>
            )}
          </Pressable>

          {lines.length === 0 ? (
            <Text className="mt-4 text-body text-muted">{t('stock.purchase.emptyLines')}</Text>
          ) : (
            lines.map((line) => {
              const item = itemsById.get(line.itemId);
              if (!item) {
                return null;
              }
              return (
                <PurchaseLineCard
                  key={line.itemId}
                  item={item}
                  line={line}
                  language={i18n.language}
                  onChange={updateLine}
                  onRemove={() => setLines((current) => current.filter((entry) => entry.itemId !== line.itemId))}
                />
              );
            })
          )}
        </ScrollView>

        <View className="border-t border-line bg-surface px-4 py-3">
          {saved ? (
            <View>
              <Text className="text-base font-semibold text-ink">{t('stock.purchase.savedTitle')}</Text>
              <Text className="mt-1 text-sm text-muted">
                {t('stock.purchase.savedBody', { invoice: invoiceNumber.trim() })}
              </Text>
              {paymentType === 'Credit' ? (
                <Text className="mt-1 text-sm text-muted">{t('stock.purchase.creditNote')}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                className="mt-3 h-12 items-center justify-center rounded-lg bg-accent"
              >
                <Text className="text-base font-semibold text-accent-ink">{t('stock.purchase.ok')}</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text className="text-sm text-muted">{t('stock.purchase.total')}</Text>
              <Text className="text-title font-bold text-ink">{formatInrFromPaise(summary.totalPaise)}</Text>
              {paymentType === 'Credit' ? (
                <Text className="mt-1 text-sm text-muted">
                  {t('stock.purchase.due')}: {formatInrFromPaise(summary.totalPaise)}
                </Text>
              ) : paymentType ? (
                <Text className="mt-1 text-sm font-semibold text-success">
                  {t('stock.purchase.paid')}: {formatInrFromPaise(summary.totalPaise)}
                </Text>
              ) : null}
              {paymentType === 'Credit' ? (
                <Text className="mt-1 text-sm text-muted">{t('stock.purchase.creditNote')}</Text>
              ) : null}
              {summary.issue ? <Text className="mt-3 text-sm text-danger">{t(`stock.errors.${summary.issue}`)}</Text> : null}
              {formError ? <Text className="mt-3 text-sm text-danger">{t(`stock.errors.${formError}`)}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => {
                  void onSave();
                }}
                className="mt-3 h-12 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
              >
                {saving ? (
                  <ActivityIndicator color={palette.accentInk} />
                ) : (
                  <Text className="text-base font-semibold text-accent-ink">{t('stock.purchase.save')}</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <ItemPickerModal
        visible={pickerOpen}
        items={items}
        lines={lines}
        onClose={() => setPickerOpen(false)}
        onApply={(next) => {
          setLines(next);
          setPickerOpen(false);
        }}
      />
    </ScreenWrapper>
  );
}

function PurchaseLineCard({
  item,
  line,
  language,
  onChange,
  onRemove,
}: {
  item: StockItem;
  line: DraftLine;
  language: string;
  onChange: (itemId: string, patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const names = itemNames(item, language);
  const volume = volumeMessage(item);
  const quantity = parseQuantity(line.quantity);
  const paise = parseRupeeToPaise(line.unitPrice);
  const linePaise = quantity !== null && paise !== null ? quantity * paise : null;

  return (
    <View className="mt-3 rounded-3xl border border-line bg-surface p-4">
      <Text className="text-sm font-bold text-accent">{item.itemCode}</Text>
      <Text className="mt-1 text-base font-semibold text-ink">{names.primary}</Text>
      <Text className="text-sm text-muted">{t(volume.key, volume.values)}</Text>

      <Text className="mb-2 mt-4 text-sm text-ink">{t('stock.purchase.quantity')}</Text>
      <TextInput
        value={line.quantity}
        onChangeText={(value) => onChange(item.id, { quantity: sanitizeQuantityInput(value) })}
        keyboardType="number-pad"
        placeholder={t('stock.purchase.quantityPlaceholder')}
        placeholderTextColor={palette.muted}
        className="h-14 rounded-2xl border border-line bg-canvas px-4 text-body text-ink"
      />

      <Text className="mb-2 mt-4 text-sm text-ink">{t('stock.purchase.cost')}</Text>
      <TextInput
        value={line.unitPrice}
        onChangeText={(value) => onChange(item.id, { unitPrice: sanitizeRupeeInput(value) })}
        keyboardType="decimal-pad"
        placeholder={t('stock.purchase.costPlaceholder')}
        placeholderTextColor={palette.muted}
        className="h-14 rounded-2xl border border-line bg-canvas px-4 text-body text-ink"
      />

      <View className="mt-4 flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-ink">
          {linePaise === null ? '—' : formatInrFromPaise(linePaise)}
        </Text>
        <Pressable accessibilityRole="button" onPress={onRemove} className="h-12 justify-center px-2">
          <Text className="text-base font-semibold text-danger">{t('stock.purchase.remove')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FieldLabel({ step, label }: { step: string; label: string }) {
  return (
    <View className="mb-2 mt-5 flex-row items-center gap-2">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-accent">
        <Text className="text-sm font-bold text-accent-ink">{step}</Text>
      </View>
      <Text className="text-body font-semibold text-ink">{label}</Text>
    </View>
  );
}
