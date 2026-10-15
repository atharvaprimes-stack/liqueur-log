import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { ProfileError } from '../../../src/domain/errors';
import { useTheme } from '../../../src/theme/theme-context';

export default function AccountScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady, updateAccount } = useAuth();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [currentMpin, setCurrentMpin] = useState('');
  const [newMpin, setNewMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const onSave = async () => {
    if (saving) {
      return;
    }
    if (newMpin !== confirmMpin) {
      setErrorCode('mismatch');
      return;
    }
    setSaving(true);
    setErrorCode(null);
    try {
      await updateAccount({ name, currentMpin, newMpin });
      router.back();
    } catch (error) {
      setErrorCode(error instanceof ProfileError ? error.code : 'unknown');
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper showBackButton padded={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="pt-4 text-title font-semibold text-ink">{t('account.title')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('account.body')}</Text>

          <Field label={t('account.name')}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('account.namePlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('account.mobile')}>
            <TextInput value={currentUser.mobileNumber} editable={false} className={`${inputClass} text-muted`} />
          </Field>
          <Field label={t('account.currentMpin')}>
            <TextInput
              value={currentMpin}
              onChangeText={(value) => setCurrentMpin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder={t('account.mpinPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('account.newMpin')}>
            <TextInput
              value={newMpin}
              onChangeText={(value) => setNewMpin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder={t('account.newMpinPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('account.confirmMpin')}>
            <TextInput
              value={confirmMpin}
              onChangeText={(value) => setConfirmMpin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder={t('account.mpinPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>

          {errorCode ? <Text className="mt-4 text-sm text-danger">{t(`account.errors.${errorCode}`)}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => {
              void onSave();
            }}
            className="mt-6 h-12 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
          >
            {saving ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text className="text-base font-semibold text-accent-ink">{t('account.save')}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const inputClass = 'h-12 rounded-lg border border-line bg-surface px-4 text-base text-ink';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-ink">{label}</Text>
      {children}
    </View>
  );
}
