import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';

type ScreenWrapperProps = {
  children: ReactNode;
  padded?: boolean;
  header?: boolean;
};

export function ScreenWrapper({ children, padded = true, header = true }: ScreenWrapperProps) {
  const { t } = useTranslation();
  const { currentTenant } = useAuth();
  const businessName = currentTenant?.businessName || t('appName');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {header ? (
        <View className="min-h-16 flex-row items-center gap-2 border-b border-line px-4 py-2">
          <Text className="min-w-0 flex-1 text-lg font-semibold text-ink" numberOfLines={1}>
            {businessName}
          </Text>
        </View>
      ) : null}
      <View className={padded ? 'flex-1 p-4' : 'flex-1'}>{children}</View>
    </SafeAreaView>
  );
}
