import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseQuantity } from '../domain/money';
import { resolveBottomInset } from '../navigation/bottomInset';
import { useTheme } from '../theme/theme-context';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
] as const;

type QuantityNumpadSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  heading?: string;
  initialQuantity: number;
  maxQuantity?: number;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
};

export function QuantityNumpadSheet({
  visible,
  title,
  subtitle,
  heading,
  initialQuantity,
  maxQuantity,
  confirmLabel,
  onClose,
  onConfirm,
}: QuantityNumpadSheetProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const [digits, setDigits] = useState('');
  const [replaced, setReplaced] = useState(false);

  useEffect(() => {
    if (visible) {
      const start = Math.max(1, Math.trunc(initialQuantity));
      const capped =
        typeof maxQuantity === 'number' ? Math.min(start, Math.max(1, Math.trunc(maxQuantity))) : start;
      setDigits(String(capped));
      setReplaced(false);
    }
  }, [initialQuantity, maxQuantity, visible]);

  const parsed = parseQuantity(digits);
  const overMax =
    parsed !== null && typeof maxQuantity === 'number' && parsed > Math.max(0, Math.trunc(maxQuantity));
  const canConfirm = parsed !== null && !overMax;

  const pressDigit = (digit: string) => {
    if (!replaced) {
      setReplaced(true);
      setDigits(digit === '0' ? '' : digit);
      return;
    }
    setDigits((current) => {
      if (current.length >= 4) {
        return current;
      }
      if (!current && digit === '0') {
        return '';
      }
      return `${current}${digit}`;
    });
  };

  const pressClear = () => {
    setReplaced(true);
    setDigits('');
  };

  const pressBack = () => {
    setReplaced(true);
    setDigits((current) => current.slice(0, -1));
  };

  const submit = () => {
    if (parsed === null) {
      return;
    }
    onConfirm(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" onPress={onClose} />
        <View
          className="rounded-t-3xl border-t border-line bg-surface px-4 pt-3"
          style={{ paddingBottom: bottomInset + 16 }}
        >
          <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-line" />
          <Text className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
            {heading ?? t('billing.quantity')}
          </Text>
          <Text className="mt-1 text-center text-lg font-bold text-ink" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-center text-sm text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}

          <View className="mt-4 items-center justify-center rounded-xl border border-line bg-canvas px-4 py-3">
            <Text className="text-4xl font-bold tabular-nums text-ink">{digits || '—'}</Text>
          </View>
          {overMax && typeof maxQuantity === 'number' ? (
            <Text className="mt-2 text-center text-sm text-danger">
              {t('billing.quantityMax', { count: Math.trunc(maxQuantity) })}
            </Text>
          ) : null}

          <View className="mt-3 gap-2">
            {KEYS.map((row) => (
              <View key={row.join('-')} className="flex-row gap-2">
                {row.map((key) => {
                  if (key === 'clear') {
                    return (
                      <NumpadKey
                        key={key}
                        label={t('billing.quantityClear')}
                        onPress={pressClear}
                        muted
                      />
                    );
                  }
                  if (key === 'back') {
                    return (
                      <NumpadKey
                        key={key}
                        accessibilityLabel={t('billing.quantityBackspace')}
                        onPress={pressBack}
                        muted
                      >
                        <Ionicons name="backspace-outline" size={22} color={palette.ink} />
                      </NumpadKey>
                    );
                  }
                  return <NumpadKey key={key} label={key} onPress={() => pressDigit(key)} />;
                })}
              </View>
            ))}
          </View>

          <View className="mt-3 flex-row gap-3">
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
              <Text className="text-sm font-semibold text-accent-ink">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NumpadKey({
  label,
  accessibilityLabel,
  onPress,
  muted = false,
  children,
}: {
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className={`h-14 min-w-0 flex-1 items-center justify-center rounded-xl border border-line ${
        muted ? 'bg-canvas' : 'bg-surface'
      }`}
    >
      {children ?? <Text className="text-2xl font-semibold text-ink">{label}</Text>}
    </Pressable>
  );
}
