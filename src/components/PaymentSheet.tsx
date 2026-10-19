import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OrderErrorCode } from '../domain/errors';
import { formatInr } from '../domain/money';
import type { PaymentMethod, SaleOrder } from '../domain/models/orders';
import type { BillPreview } from '../hooks/useBilling';
import { resolveBottomInset } from '../navigation/bottomInset';
import { useTheme } from '../theme/theme-context';
import { ThermalReceipt } from './ThermalReceipt';

const COLLECT_METHODS = ['Cash', 'UPI'] as const;
type CollectMethod = (typeof COLLECT_METHODS)[number];

const METHOD_ICONS: Record<CollectMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: 'cash-outline',
  UPI: 'qr-code-outline',
};

type PaymentSheetProps = {
  visible: boolean;
  order: SaleOrder;
  submitting: boolean;
  errorCode: OrderErrorCode | null;
  confirmLabel: string;
  shareNotice: 'failed' | 'downloaded' | null;
  draftPreview: (method: PaymentMethod) => BillPreview | null;
  onClose: () => void;
  onSubmit: (payment: { method: PaymentMethod; paidAmount: number }) => void;
  onPrint: (preview: BillPreview) => void;
  onShare: (preview: BillPreview) => void;
};

export function PaymentSheet({
  visible,
  order,
  submitting,
  errorCode,
  confirmLabel,
  shareNotice,
  draftPreview,
  onClose,
  onSubmit,
  onPrint,
  onShare,
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

  const preview = useMemo(() => draftPreview(method), [draftPreview, method]);

  const submit = () => {
    if (submitting) {
      return;
    }
    onSubmit({ method, paidAmount: order.totalAmount });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" disabled={submitting} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: '92%' }}
        >
          <View
            className="rounded-t-3xl border-t border-line bg-surface"
            style={{ maxHeight: '100%', paddingBottom: bottomInset + 16 }}
          >
            <View className="px-4 pt-4">
              <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-line" />
              <Text className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
                {t('billing.sheetTitle')}
              </Text>
              <Text className="mt-2 text-center text-3xl font-bold text-ink">{formatInr(order.totalAmount)}</Text>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerClassName="items-center px-3 py-3"
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {preview ? (
                <ThermalReceipt receipt={preview.receipt} copy={preview.copy} />
              ) : (
                <Text className="px-2 py-6 text-center text-sm text-muted">{t('billing.missing')}</Text>
              )}
            </ScrollView>

            <View className="border-t border-line px-4 pt-3">
              <Text className="mb-2 text-sm font-semibold text-muted">{t('billing.method')}</Text>
              <View className="flex-row gap-3">
                {COLLECT_METHODS.map((entry) => {
                  const selected = method === entry;
                  return (
                    <SheetButton
                      key={entry}
                      label={t(`billing.methods.${entry}`)}
                      icon={METHOD_ICONS[entry]}
                      selected={selected}
                      disabled={submitting}
                      iconColor={selected ? palette.accentInk : palette.muted}
                      onPress={() => setMethod(entry)}
                    />
                  );
                })}
              </View>

              {errorCode ? (
                <Text className="mt-3 text-center text-sm text-danger">{t(`billing.errors.${errorCode}`)}</Text>
              ) : null}
              {shareNotice === 'failed' ? (
                <Text className="mt-3 text-center text-sm text-danger">{t('billing.shareFailed')}</Text>
              ) : null}
              {shareNotice === 'downloaded' ? (
                <Text className="mt-3 text-center text-sm text-ink">{t('billing.downloaded')}</Text>
              ) : null}

              <View className="mt-3 flex-row gap-3">
                <SheetButton
                  label={t('billing.print')}
                  icon="print-outline"
                  disabled={submitting || !preview}
                  iconColor={palette.ink}
                  onPress={() => {
                    if (preview) {
                      onPrint(preview);
                    }
                  }}
                />
                <SheetButton
                  label={t('billing.share')}
                  icon="logo-whatsapp"
                  disabled={submitting || !preview}
                  iconColor={palette.ink}
                  onPress={() => {
                    if (preview) {
                      onShare(preview);
                    }
                  }}
                />
              </View>

              <View className="mt-3 flex-row gap-3">
                <SheetButton
                  label={t('billing.cancel')}
                  icon="close-outline"
                  disabled={submitting}
                  iconColor={palette.muted}
                  muted
                  onPress={onClose}
                />
                <SheetButton
                  label={confirmLabel}
                  icon="checkmark-circle-outline"
                  selected
                  disabled={submitting}
                  busy={submitting}
                  iconColor={palette.accentInk}
                  onPress={submit}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const SHEET_BUTTON_CLASS =
  'h-12 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-2 disabled:opacity-50';

function SheetButton({
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
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`${SHEET_BUTTON_CLASS} ${selected ? 'border-accent bg-accent' : 'border-line bg-canvas'}`}
    >
      {busy ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={iconColor} />
          <Text
            className={`text-sm font-semibold ${
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
