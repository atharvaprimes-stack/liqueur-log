import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DashboardHeader } from '../../../src/components/dashboard/DashboardHeader';
import { MetricCards } from '../../../src/components/dashboard/MetricCards';
import { RecentOrdersList } from '../../../src/components/dashboard/RecentOrdersList';
import { SalesOverviewChart } from '../../../src/components/dashboard/SalesOverviewChart';
import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { useDashboard } from '../../../src/hooks/useDashboard';
import { useTheme } from '../../../src/theme/theme-context';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, currentTenant } = useAuth();
  const locale = i18n.language.startsWith('mr') ? 'mr-IN' : 'en-IN';
  const [refreshing, setRefreshing] = useState(false);
  const { snapshot, isLoading, error, reload } = useDashboard();
  const shopName = currentTenant?.businessName || t('appName');
  const alertCount = snapshot ? snapshot.lowCount + snapshot.outCount : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <ScreenWrapper padded={false} header={false}>
      {isLoading && !snapshot ? (
        <ActivityIndicator className="mt-10" color={palette.accent} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="mx-auto w-full max-w-2xl gap-3.5 px-3.5 pb-10 pt-2"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={palette.accent}
              colors={[palette.accent]}
            />
          }
        >
          <DashboardHeader
            shopName={shopName}
            staffName={currentUser?.name ?? ''}
            roleLabel={currentUser ? t(`roles.${currentUser.role}`) : ''}
            alertCount={alertCount}
          />

          {error ? <Text className="text-sm text-danger">{t('home.loadError')}</Text> : null}

          {snapshot ? (
            <>
              <MetricCards snapshot={snapshot} />
              <SalesOverviewChart
                last7Days={snapshot.salesLast7Days}
                last12Months={snapshot.salesLast12Months}
                locale={locale}
              />
              <RecentOrdersList orders={snapshot.recentOrders} />
            </>
          ) : null}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}
