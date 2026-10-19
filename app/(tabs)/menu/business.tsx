import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { SaveRow } from '../../../src/components/FormActions';
import { leaveScreen } from '../../../src/navigation/leave';
import { useAuth } from '../../../src/context/AuthContext';
import { ProfileError } from '../../../src/domain/errors';
import { useTheme } from '../../../src/theme/theme-context';

export default function BusinessScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, currentTenant, isReady, updateTenant } = useAuth();
  const [businessName, setBusinessName] = useState(currentTenant?.businessName ?? '');
  const [address, setAddress] = useState(currentTenant?.address ?? '');
  const [currentMpin, setCurrentMpin] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }
  if (currentUser.role !== 'ADMIN' || !currentTenant) {
    return <Redirect href="/menu" />;
  }

  const onSave = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setErrorCode(null);
    try {
      await updateTenant({ businessName, address, currentMpin });
      leaveScreen('/menu');
    } catch (error) {
      setErrorCode(error instanceof ProfileError ? error.code : 'unknown');
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper padded={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="pt-4 text-title font-semibold text-ink">{t('business.title')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('business.body')}</Text>

          <Field label={t('business.name')}>
            <TextInput
              value={businessName}
              onChangeText={setBusinessName}
              placeholder={t('business.namePlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('business.address')}>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder={t('business.addressPlaceholder')}
              placeholderTextColor={palette.muted}
              multiline
              className="min-h-24 rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink"
              style={{ textAlignVertical: 'top' }}
            />
          </Field>
          <Field label={t('business.subscription')}>
            <View className="min-h-12 justify-center rounded-lg border border-line bg-canvas px-4 py-3">
              <Text className="text-base font-semibold text-ink">
                {t(`business.status.${currentTenant.subscriptionStatus}`)}
              </Text>
              <Text className="mt-1 text-sm text-muted">{t('business.subscriptionHint')}</Text>
            </View>
          </Field>
          <Field label={t('business.currentMpin')}>
            <TextInput
              value={currentMpin}
              onChangeText={(value) => setCurrentMpin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder={t('business.mpinPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>

          {errorCode ? <Text className="mt-4 text-sm text-danger">{t(`business.errors.${errorCode}`)}</Text> : null}
          <SaveRow
            parent="/menu"
            saveLabel={t('business.save')}
            saving={saving}
            onSave={() => {
              void onSave();
            }}
          />
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
