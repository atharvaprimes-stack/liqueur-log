import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OrderErrorCode } from '../domain/errors';
import { formatInr, formatRupeeInput, parseRupeeToPaise, sanitizeRupeeInput } from '../domain/money';
import { deriveSettlement, type SaleOrder } from '../domain/models/orders';
import { resolveBottomInset } from '../navigation/bottomInset';
import { useTheme } from '../theme/theme-context';

type PaymentSheetProps = {
  visible: boolean;
  order: SaleOrder;
  submitting: boolean;
  errorCode: OrderErrorCode | null;
  onClose: () => void;
  onSubmit: (payment: { cashAmount: number; upiAmount: number }) => void;
};

export function PaymentSheet({
  visible,
  order,
  submitting,
  errorCode,
  onClose,
  onSubmit,
}: PaymentSheetProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const [cashInput, setCashInput] = useState('');
  const [upiInput, setUpiInput] = useState('');

  useEffect(() => {
    if (visible) {
      setCashInput('');
      setUpiInput('');
    }
  }, [visible, order.id, order.totalAmount]);

  const totalPaise = Math.round(order.totalAmount * 100);
  const cashPaise = cashInput.trim() === '' ? 0 : parseRupeeToPaise(cashInput);
  const upiPaise = upiInput.trim() === '' ? 0 : parseRupeeToPaise(upiInput);
  const amountsValid = cashPaise !== null && upiPaise !== null;
  const paidPaise = amountsValid ? cashPaise + upiPaise : null;
  const remainingPaise = paidPaise === null ? null : totalPaise - paidPaise;
  const settlement =
    amountsValid && cashPaise !== null && upiPaise !== null
      ? deriveSettlement(cashPaise / 100, upiPaise / 100, order.totalAmount)
      : null;
  const canClose = Boolean(settlement) && !submitting;

  const statusText = useMemo(() => {
    if (!amountsValid || remainingPaise === null) {
      return t('billing.amountInvalid');
    }
    if (remainingPaise === 0) {
      return t('billing.amountMatched');
    }
    if (remainingPaise > 0) {
      return t('billing.amountShort', { amount: formatInr(remainingPaise / 100) });
    }
    return t('billing.amountOver', { amount: formatInr(Math.abs(remainingPaise) / 100) });
  }, [amountsValid, remainingPaise, t]);

  const fillAllCash = () => {
    setCashInput(formatRupeeInput(order.totalAmount));
    setUpiInput('0');
  };

  const fillAllUpi = () => {
    setCashInput('0');
    setUpiInput(formatRupeeInput(order.totalAmount));
  };

  const submit = () => {
    if (!settlement || submitting) {
      return;
    }
    onSubmit({ cashAmount: settlement.cashAmount, upiAmount: settlement.upiAmount });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" disabled={submitting} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4"
            style={{ paddingBottom: bottomInset + 16 }}
          >
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-line" />
            <Text className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
              {t('billing.sheetTitle')}
            </Text>
            <Text className="mt-2 text-center text-3xl font-bold text-ink">{formatInr(order.totalAmount)}</Text>
            <Text className="mt-1 text-center text-sm text-muted">{t('billing.splitHint')}</Text>

            <View className="mt-4 flex-row gap-2">
              <PresetButton
                label={t('billing.allCash')}
                icon="cash-outline"
                disabled={submitting}
                iconColor={palette.ink}
                onPress={fillAllCash}
              />
              <PresetButton
                label={t('billing.allUpi')}
                icon="qr-code-outline"
                disabled={submitting}
                iconColor={palette.ink}
                onPress={fillAllUpi}
              />
            </View>

            <View className="mt-4 gap-3">
              <AmountField
                label={t('billing.methods.Cash')}
                value={cashInput}
                editable={!submitting}
                onChangeText={(value) => setCashInput(sanitizeRupeeInput(value))}
              />
              <AmountField
                label={t('billing.methods.UPI')}
                value={upiInput}
                editable={!submitting}
                onChangeText={(value) => setUpiInput(sanitizeRupeeInput(value))}
              />
            </View>

            <Text
              className={`mt-3 text-center text-sm ${
                settlement ? 'text-success' : 'text-muted'
              }`}
            >
              {statusText}
            </Text>

            {errorCode ? (
              <Text className="mt-2 text-center text-sm text-danger">{t(`billing.errors.${errorCode}`)}</Text>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              <ActionButton
                label={t('billing.cancel')}
                icon="close-outline"
                disabled={submitting}
                iconColor={palette.muted}
                muted
                onPress={onClose}
              />
              <ActionButton
                label={t('billing.closeBill')}
                icon="checkmark-circle-outline"
                selected
                disabled={!canClose}
                busy={submitting}
                iconColor={palette.accentInk}
                onPress={submit}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function AmountField({
  label,
  value,
  editable,
  onChangeText,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View>
      <Text className="mb-1.5 text-sm font-semibold text-muted">{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#9CA3AF"
        className="h-12 rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
      />
    </View>
  );
}

function PresetButton({
  label,
  icon,
  onPress,
  disabled = false,
  iconColor,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  iconColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-2 disabled:opacity-50"
    >
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  selected = false,
  muted = false,
  busy = false,
  iconColor,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  muted?: boolean;
  busy?: boolean;
  iconColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-14 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-xl border px-1 disabled:opacity-50 ${
        selected ? 'border-accent bg-accent' : 'border-line bg-canvas'
      }`}
    >
      {busy ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={iconColor} />
          <Text
            className={`text-[11px] font-semibold ${
              selected ? 'text-accent-ink' : muted ? 'text-muted' : 'text-ink'
            }`}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
