import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { FormScreen } from '../../../src/components/FormScreen';
import { SaveRow } from '../../../src/components/FormActions';
import { leaveScreen } from '../../../src/navigation/leave';
import { useAuth } from '../../../src/context/AuthContext';
import { ProfileError } from '../../../src/domain/errors';
import { useTheme } from '../../../src/theme/theme-context';

export default function TableCountScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, currentTenant, isReady, updateTableCount } = useAuth();
  const [countText, setCountText] = useState(currentTenant ? String(currentTenant.tableCount) : '');
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
    const tableCount = Number(countText);
    if (!/^\d{1,3}$/.test(countText) || !Number.isInteger(tableCount)) {
      setErrorCode('tables');
      return;
    }
    setSaving(true);
    setErrorCode(null);
    try {
      await updateTableCount({ tableCount, currentMpin });
      leaveScreen('/menu');
    } catch (error) {
      setErrorCode(error instanceof ProfileError ? error.code : 'unknown');
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper padded={false}>
      <FormScreen contentContainerClassName="px-4 pb-8">
        <Text className="pt-4 text-title font-semibold text-ink">{t('floor.title')}</Text>
        <Text className="mt-1 text-sm text-muted">{t('floor.body')}</Text>
        <Text className="mb-2 mt-5 text-sm font-semibold text-ink">{t('floor.count')}</Text>
        <TextInput
          value={countText}
          onChangeText={(value) => setCountText(value.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder={t('floor.countPlaceholder')}
          placeholderTextColor={palette.muted}
          className="h-12 rounded-lg border border-line bg-surface px-4 text-base text-ink"
        />
        <Text className="mb-2 mt-4 text-sm font-semibold text-ink">{t('floor.currentMpin')}</Text>
        <TextInput
          value={currentMpin}
          onChangeText={(value) => setCurrentMpin(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder={t('floor.mpinPlaceholder')}
          placeholderTextColor={palette.muted}
          className="h-12 rounded-lg border border-line bg-surface px-4 text-base text-ink"
        />
        {errorCode ? <Text className="mt-4 text-sm text-danger">{t(`floor.errors.${errorCode}`)}</Text> : null}
        <SaveRow
          parent="/menu"
          saveLabel={t('floor.save')}
          saving={saving}
          onSave={() => {
            void onSave();
          }}
        />
      </FormScreen>
    </ScreenWrapper>
  );
}
