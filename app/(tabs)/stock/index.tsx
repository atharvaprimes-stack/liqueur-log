import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';

export default function StockScreen() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <ScreenWrapper>
      <Text className="text-display font-semibold text-ink">{t('stock.title')}</Text>
      <View className="mt-4 self-start rounded-full border border-line bg-surface px-4 py-2">
        <Text className="text-body font-semibold text-ink">{t(isAdmin ? 'stock.fullAccess' : 'stock.viewOnly')}</Text>
      </View>
      <View className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <Text className="text-body text-muted">{t(isAdmin ? 'stock.adminBody' : 'stock.staffBody')}</Text>
      </View>
    </ScreenWrapper>
  );
}
