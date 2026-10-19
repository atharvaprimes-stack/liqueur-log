import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OrderErrorCode } from '../domain/errors';
import { formatInr } from '../domain/money';
import type { PaymentMethod } from '../domain/models/orders';
import { resolveBottomInset } from '../navigation/bottomInset';
import { useTheme } from '../theme/theme-context';

const COLLECT_METHODS = ['Cash', 'UPI'] as const;
type CollectMethod = (typeof COLLECT_METHODS)[number];

const METHOD_ICONS: Record<CollectMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: 'cash-outline',
  UPI: 'qr-code-outline',
};

type PaymentSheetProps = {
  visible: boolean;
  totalAmount: number;
  submitting: boolean;
  errorCode: OrderErrorCode | null;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (payment: { method: PaymentMethod; paidAmount: number }) => void;
};

export function PaymentSheet({
  visible,
  totalAmount,
  submitting,
  errorCode,
  confirmLabel,
  onClose,
  onSubmit,
}: PaymentSheetProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const [method, setMethod] = useState<CollectMethod>('Cash');

  useEffect(() => {
    if (visible) {
      setMethod('Cash');
    }
  }, [visible]);

  const submit = () => {
    if (submitting) {
      return;
    }
    onSubmit({ method, paidAmount: totalAmount });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" disabled={submitting} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4" style={{ paddingBottom: bottomInset + 16 }}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />

            <Text className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
              {t('billing.sheetTitle')}
            </Text>
            <Text className="mt-2 text-center text-3xl font-bold text-ink">{formatInr(totalAmount)}</Text>

            <Text className="mb-2 mt-5 text-sm font-semibold text-muted">{t('billing.method')}</Text>
            <View className="flex-row rounded-lg border border-line bg-canvas p-1">
              {COLLECT_METHODS.map((entry) => {
                const selected = method === entry;
                return (
                  <Pressable
                    key={entry}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={submitting}
                    onPress={() => setMethod(entry)}
                    className={`h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-md ${
                      selected ? 'bg-accent' : ''
                    }`}
                  >
                    <Ionicons name={METHOD_ICONS[entry]} size={18} color={selected ? palette.accentInk : palette.muted} />
                    <Text className={`text-sm font-semibold ${selected ? 'text-accent-ink' : 'text-muted'}`}>
                      {t(`billing.methods.${entry}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {errorCode ? (
              <Text className="mt-4 text-center text-sm text-danger">{t(`billing.errors.${errorCode}`)}</Text>
            ) : null}

            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={onClose}
                className="h-14 min-w-0 flex-1 items-center justify-center rounded-xl border border-line bg-canvas disabled:opacity-50"
              >
                <Text className="text-base font-semibold text-muted">{t('billing.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={submit}
                className="h-14 min-w-0 flex-1 items-center justify-center rounded-xl bg-accent disabled:opacity-50"
              >
                {submitting ? (
                  <ActivityIndicator color={palette.accentInk} />
                ) : (
                  <Text className="text-center text-base font-bold text-accent-ink" numberOfLines={1}>
                    {confirmLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
