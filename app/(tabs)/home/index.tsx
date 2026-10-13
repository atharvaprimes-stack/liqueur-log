import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <ScreenWrapper>
      <Text className="text-display font-semibold text-ink">{t('home.title')}</Text>
      <View className="mt-6 gap-4">
        <View className="rounded-3xl border border-line bg-surface p-5">
          <Text className="text-title font-semibold text-ink">{t('home.summaryTitle')}</Text>
          <Text className="mt-2 text-body text-muted">{t('home.summaryBody')}</Text>
        </View>
        <View className="rounded-3xl border border-line bg-surface p-5">
          <Text className="text-title font-semibold text-ink">{t('home.alertsTitle')}</Text>
          <Text className="mt-2 text-body text-muted">{t('home.alertsBody')}</Text>
        </View>
      </View>
    </ScreenWrapper>
  );
}
