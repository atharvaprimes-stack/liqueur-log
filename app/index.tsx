import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { currentUser, isReady, databaseError } = useAuth();
  const { t } = useTranslation();

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (databaseError) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="mb-2 text-center text-lg font-semibold text-ink">{t('common.dbErrorTitle')}</Text>
        <Text className="mb-4 text-center text-sm text-muted">{t('common.dbErrorBody')}</Text>
        <Text className="text-center text-xs text-muted" selectable>
          {databaseError}
        </Text>
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
