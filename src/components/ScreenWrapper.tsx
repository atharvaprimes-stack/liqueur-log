import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/theme-context';

type ScreenWrapperProps = {
  children: ReactNode;
  showBackButton?: boolean;
  padded?: boolean;
};

export function ScreenWrapper({ children, showBackButton = false, padded = true }: ScreenWrapperProps) {
  const { t } = useTranslation();
  const { currentUser, currentTenant } = useAuth();
  const { palette } = useTheme();
  const businessName = currentTenant?.businessName || t('appName');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View className="min-h-16 flex-row items-center gap-2 border-b border-line px-4 py-2">
        {showBackButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Ionicons name="chevron-back" size={28} color={palette.accent} />
          </Pressable>
        ) : null}
        <Text className="min-w-0 flex-1 text-xl font-semibold text-ink" numberOfLines={1}>
          {businessName}
        </Text>
        {currentUser ? (
          <View className="shrink-0 rounded-full bg-accent px-3 py-1.5">
            <Text className="text-sm font-bold text-accent-ink" style={{ lineHeight: 20 }}>
              {t(`roles.${currentUser.role}`)}
            </Text>
          </View>
        ) : null}
      </View>
      <View className={padded ? 'flex-1 p-4' : 'flex-1'}>{children}</View>
    </SafeAreaView>
  );
}
