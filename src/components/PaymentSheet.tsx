import { useEffect, useState } from 'react';
import {
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

import { previewBalance, resolvePayment } from '../domain/billing';
import { orderErrorCode, type OrderErrorCode } from '../domain/errors';
import { formatInr, sanitizeRupeeInput } from '../domain/money';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/models/orders';
import { ActionRow } from './FormActions';
import { useTheme } from '../theme/theme-context';

type PaymentSheetProps = {
  visible: boolean;
  totalAmount: number;
  submitting: boolean;
  errorCode: OrderErrorCode | null;
  onClose: () => void;
  onSubmit: (payment: { method: PaymentMethod; paidAmount: number }) => void;
};

const METHOD_ICONS = {
  Cash: 'cash-outline',
  UPI: 'qr-code-outline',
  Other: 'ellipsis-horizontal',
} as const;

export function PaymentSheet({ visible, totalAmount, submitting, errorCode, onClose, onSubmit }: PaymentSheetProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [paidInput, setPaidInput] = useState('');
  const [localError, setLocalError] = useState<OrderErrorCode | null>(null);
  const balance = previewBalance(totalAmount, mode, paidInput);
  const shownError = localError ?? errorCode;

  useEffect(() => {
    if (visible) {
      setMethod(null);
      setMode('full');
      setPaidInput('');
      setLocalError(null);
    }
  }, [visible]);

  const submit = () => {
    if (submitting) {
      return;
    }
    try {
      const payment = resolvePayment(totalAmount, method, mode, paidInput);
      setLocalError(null);
      onSubmit({ method: payment.method, paidAmount: payment.paidAmount });
    } catch (error) {
      setLocalError(orderErrorCode(error));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" disabled={submitting} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />
            <Text className="text-title font-semibold text-ink">{t('billing.sheetTitle')}</Text>
            <Text className="mt-1 text-2xl font-bold text-ink">{formatInr(totalAmount)}</Text>

            <Text className="mb-2 mt-5 text-sm font-semibold text-ink">{t('billing.method')}</Text>
            <View className="flex-row gap-3">
              {PAYMENT_METHODS.filter((entry) => entry !== 'Other').map((entry) => (
                <MethodTile
                  key={entry}
                  label={t(`billing.methods.${entry}`)}
                  icon={METHOD_ICONS[entry]}
                  selected={method === entry}
                  onPress={() => {
                    setMethod(entry);
                    setLocalError(null);
                  }}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: method === 'Other' }}
              onPress={() => {
                setMethod('Other');
                setLocalError(null);
              }}
              className={`mt-3 h-12 flex-row items-center justify-center gap-2 rounded-xl border ${
                method === 'Other' ? 'border-accent bg-accent' : 'border-line bg-canvas'
              }`}
            >
              <Ionicons name={METHOD_ICONS.Other} size={18} color={method === 'Other' ? palette.accentInk : palette.ink} />
              <Text className={`text-base font-semibold ${method === 'Other' ? 'text-accent-ink' : 'text-ink'}`}>
                {t('billing.methods.Other')}
              </Text>
            </Pressable>

            <View className="mt-4 flex-row gap-3">
              {(['full', 'partial'] as const).map((entry) => (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === entry }}
                  onPress={() => {
                    setMode(entry);
                    setLocalError(null);
                  }}
                  className={`h-12 flex-1 items-center justify-center rounded-xl border ${
                    mode === entry ? 'border-accent bg-accent' : 'border-line bg-canvas'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${mode === entry ? 'text-accent-ink' : 'text-ink'}`}>
                    {t(`billing.${entry}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === 'partial' ? (
              <View className="mt-4">
                <Text className="mb-2 text-sm font-semibold text-ink">{t('billing.paid')}</Text>
                <TextInput
                  value={paidInput}
                  onChangeText={(value) => {
                    setPaidInput(sanitizeRupeeInput(value));
                    setLocalError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={t('billing.paidPlaceholder')}
                  placeholderTextColor={palette.muted}
                  className="h-12 rounded-lg border border-line bg-canvas px-4 text-base text-ink"
                />
                {balance !== null ? (
                  <Text className="mt-2 text-sm font-semibold text-ink">
                    {t('billing.balance', { amount: formatInr(balance) })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {shownError ? <Text className="mt-4 text-sm text-danger">{t(`billing.errors.${shownError}`)}</Text> : null}

            <ActionRow
              className="mt-5"
              leading={{
                label: t('billing.cancel'),
                onPress: onClose,
                disabled: submitting,
              }}
              trailing={{
                label: t('billing.closeBill'),
                onPress: submit,
                tone: 'accent',
                busy: submitting,
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function MethodTile({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-24 flex-1 items-center justify-center gap-2 rounded-2xl border-2 ${
        selected ? 'border-accent bg-accent' : 'border-line bg-canvas'
      }`}
    >
      <Ionicons name={icon} size={28} color={selected ? palette.accentInk : palette.ink} />
      <Text className={`text-base font-bold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
