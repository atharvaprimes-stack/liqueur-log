import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';

export default function TablesScreen() {
  const { t } = useTranslation();
  const { currentTenant } = useAuth();
  const count = currentTenant?.tableCount ?? 0;

  return (
    <ScreenWrapper>
      <View className="rounded-lg border border-line bg-surface p-5">
        <Text className="text-base font-semibold text-ink">{t('tables.count', { count })}</Text>
        <Text className="mt-2 text-body text-muted">{t('tables.body')}</Text>
      </View>
    </ScreenWrapper>
  );
}
