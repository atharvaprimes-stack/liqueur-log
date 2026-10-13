import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';

export default function TablesScreen() {
  const { t } = useTranslation();

  return (
    <ScreenWrapper>
      <Text className="text-display font-semibold text-ink">{t('tables.title')}</Text>
      <View className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <Text className="text-body text-muted">{t('tables.body')}</Text>
      </View>
    </ScreenWrapper>
  );
}
