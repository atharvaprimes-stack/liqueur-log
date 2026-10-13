import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../theme/theme-context';

type StaffFormValues = {
  name: string;
  mobileNumber: string;
  mpin: string;
};

type StaffFormModalProps = {
  visible: boolean;
  title: string;
  submitLabel: string;
  requireMpin: boolean;
  initialValues: StaffFormValues;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => void;
};

export function StaffFormModal({
  visible,
  title,
  submitLabel,
  requireMpin,
  initialValues,
  error,
  saving,
  onClose,
  onSubmit,
}: StaffFormModalProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const [name, setName] = useState(initialValues.name);
  const [mobileNumber, setMobileNumber] = useState(initialValues.mobileNumber);
  const [mpin, setMpin] = useState(initialValues.mpin);

  useEffect(() => {
    if (visible) {
      setName(initialValues.name);
      setMobileNumber(initialValues.mobileNumber);
      setMpin(initialValues.mpin);
    }
  }, [initialValues.mobileNumber, initialValues.mpin, initialValues.name, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 items-center justify-center bg-black/70 px-4">
        <View className="w-full max-w-md rounded-3xl border border-line bg-surface p-5">
          <Text className="text-title font-semibold text-ink">{title}</Text>
          <Text className="mt-1 text-sm text-muted">{t('staff.scope')}</Text>

          <Text className="mb-2 mt-5 text-sm text-ink">{t('staff.name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('staff.namePlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="words"
            className="rounded-2xl border border-line bg-canvas px-4 py-3 text-body text-ink"
          />

          <Text className="mb-2 mt-4 text-sm text-ink">{t('staff.mobile')}</Text>
          <TextInput
            value={mobileNumber}
            onChangeText={(value) => setMobileNumber(value.replace(/\D/g, '').slice(0, 10))}
            placeholder={t('staff.mobilePlaceholder')}
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            maxLength={10}
            className="rounded-2xl border border-line bg-canvas px-4 py-3 text-body text-ink"
          />

          <Text className="mb-2 mt-4 text-sm text-ink">{requireMpin ? t('staff.mpin') : t('staff.newMpin')}</Text>
          <TextInput
            value={mpin}
            onChangeText={(value) => setMpin(value.replace(/\D/g, '').slice(0, 4))}
            placeholder={requireMpin ? t('staff.mpinPlaceholder') : t('staff.keepMpin')}
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            className="rounded-2xl border border-line bg-canvas px-4 py-3 text-body text-ink"
          />

          {error ? <Text className="mt-4 text-sm text-danger">{error}</Text> : null}

          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={onClose}
              className="h-14 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
            >
              <Text className="text-base font-semibold text-ink">{t('staff.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => onSubmit({ name, mobileNumber, mpin })}
              className="h-14 flex-1 items-center justify-center rounded-lg bg-accent disabled:opacity-60"
            >
              {saving ? (
                <ActivityIndicator color={palette.accentInk} />
              ) : (
                <Text className="text-base font-semibold text-accent-ink">{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
