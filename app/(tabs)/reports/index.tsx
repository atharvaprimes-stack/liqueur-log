import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';

export default function ReportsScreen() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  if (currentUser && currentUser.role !== 'ADMIN') {
    return <Redirect href="/home" />;
  }

  return (
    <ScreenWrapper>
      <Text className="text-display font-semibold text-ink">{t('reports.title')}</Text>
      <View className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <Text className="text-body text-muted">{t('reports.body')}</Text>
      </View>
    </ScreenWrapper>
  );
}
