import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

type DashboardHeaderProps = {
  shopName: string;
  staffName: string;
  roleLabel: string;
  alertCount: number;
};

export function DashboardHeader({ shopName, staffName, roleLabel, alertCount }: DashboardHeaderProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const initials = avatarInitials(staffName || shopName);

  return (
    <View className="rounded-2xl border border-line bg-surface px-4 py-3.5" style={getCardShadow(palette)}>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-accent/20">
          <Text className="text-base font-bold text-accent">{initials}</Text>
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-ink" numberOfLines={1}>
            {shopName}
          </Text>
          <Text className="mt-0.5 text-sm font-semibold text-muted" numberOfLines={1}>
            {staffName ? `${staffName}${roleLabel ? ` · ${roleLabel}` : ''}` : roleLabel}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.alerts')}
          onPress={() =>
            alertCount > 0
              ? router.push({ pathname: '/stock', params: { focus: 'low', at: String(Date.now()) } })
              : router.push('/stock')
          }
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas"
        >
          <Ionicons name="notifications-outline" size={20} color={palette.ink} />
          {alertCount > 0 ? (
            <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center rounded-full bg-danger px-1">
              <Text className="text-[10px] font-bold text-accent-ink">{alertCount > 9 ? '9+' : alertCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'LL';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
