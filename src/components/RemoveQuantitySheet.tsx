import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cssInterop } from 'nativewind';

cssInterop(KeyboardAvoidingView, { className: 'style' });

import { parseQuantity, sanitizeQuantityInput } from '../domain/money';
import { resolveBottomInset } from '../navigation/bottomInset';
import { useTheme } from '../theme/theme-context';

type RemoveQuantitySheetProps = {
  visible: boolean;
  title: string;
  available: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
};

export function RemoveQuantitySheet({
  visible,
  title,
  available,
  onClose,
  onConfirm,
}: RemoveQuantitySheetProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const [qtyInput, setQtyInput] = useState('1');

  useEffect(() => {
    if (visible) {
      setQtyInput('1');
    }
  }, [visible]);

  const trimmed = qtyInput.trim();
  const parsed = trimmed === '' ? 1 : parseQuantity(trimmed);
  const max = Math.max(1, Math.trunc(available));
  const overMax = parsed !== null && parsed > max;
  const canConfirm = parsed !== null && !overMax;

  const submit = () => {
    if (!canConfirm || parsed === null) {
      return;
    }
    onConfirm(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" onPress={onClose} />
        <KeyboardAvoidingView behavior="padding">
          <View
            className="rounded-t-3xl border-t border-line bg-surface px-4 pt-3"
            style={{ paddingBottom: bottomInset + 16 }}
          >
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-line" />
            <Text className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
              {t('billing.removeQuantity')}
            </Text>
            <Text className="mt-1 text-center text-lg font-bold text-ink" numberOfLines={1}>
              {title}
            </Text>
            <Text className="mt-0.5 text-center text-sm text-muted">
              {t('billing.quantityOnOrder', { count: max })}
            </Text>

            <View className="mt-4 h-14 justify-center rounded-xl border border-line bg-canvas px-4">
              <TextInput
                value={qtyInput}
                onChangeText={(value) => setQtyInput(sanitizeQuantityInput(value))}
                onBlur={() => {
                  if (qtyInput.trim() === '') {
                    setQtyInput('1');
                  }
                }}
                onSubmitEditing={submit}
                keyboardType="number-pad"
                selectTextOnFocus
                maxLength={4}
                returnKeyType="done"
                autoFocus
                accessibilityLabel={t('billing.quantity')}
                placeholder="1"
                placeholderTextColor={palette.muted}
                className="w-full py-0 text-center text-2xl font-bold text-ink"
                style={{ margin: 0, padding: 0 }}
              />
            </View>
            {overMax ? (
              <Text className="mt-2 text-center text-sm text-danger">
                {t('billing.quantityMax', { count: max })}
              </Text>
            ) : null}

            <View className="mt-4 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                className="h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
              >
                <Text className="text-sm font-semibold text-muted">{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!canConfirm}
                onPress={submit}
                className={`h-12 min-w-0 flex-1 items-center justify-center rounded-lg bg-accent ${
                  canConfirm ? '' : 'opacity-50'
                }`}
              >
                <Text className="text-sm font-semibold text-accent-ink">{t('billing.removeConfirm')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
