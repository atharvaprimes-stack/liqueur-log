import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../theme/theme-context';
import { getCardShadow } from './cardShadow';

type DashboardHeaderProps = {
  shopName: string;
  staffName: string;
  roleLabel: string;
  lowCount: number;
  outCount: number;
};

type StockNotification = {
  id: string;
  body: string;
};

export function DashboardHeader({
  shopName,
  staffName,
  roleLabel,
  lowCount,
  outCount,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const initials = avatarInitials(staffName || shopName);
  const [panelOpen, setPanelOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  const notifications = useMemo(() => {
    const items: StockNotification[] = [];
    if (outCount > 0) {
      items.push({
        id: `out:${outCount}`,
        body: t('home.outOfStockCount', { count: formatCount(outCount) }),
      });
    }
    if (lowCount > 0) {
      items.push({
        id: `low:${lowCount}`,
        body: t('home.lowStockCount', { count: formatCount(lowCount) }),
      });
    }
    return items;
  }, [lowCount, outCount, t]);

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)),
    [notifications, readIds],
  );

  useEffect(() => {
    const activeIds = new Set(notifications.map((item) => item.id));
    setReadIds((current) => current.filter((id) => activeIds.has(id)));
  }, [notifications]);

  const openPanel = () => {
    blurActiveElement();
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
  };

  const markRead = (id: string) => {
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
  };

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
          accessibilityLabel={t('home.notifications')}
          onPress={openPanel}
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas"
        >
          <Ionicons name="notifications-outline" size={20} color={palette.ink} />
          {unreadNotifications.length > 0 ? (
            <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center rounded-full bg-danger px-1">
              <Text className="text-[10px] font-bold text-accent-ink">
                {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Modal visible={panelOpen} transparent animationType="fade" onRequestClose={closePanel}>
        <View style={themeStyle} className="flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={closePanel}
            className="absolute inset-0 bg-black/50"
          />
          <View className="mx-auto mt-20 w-full max-w-md px-3.5">
            <View className="rounded-2xl border border-line bg-surface" style={getCardShadow(palette)}>
              <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
                <Text className="text-base font-bold text-ink">{t('home.notifications')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  onPress={closePanel}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color={palette.muted} />
                </Pressable>
              </View>

              {unreadNotifications.length === 0 ? (
                <Text className="px-4 py-6 text-sm text-muted">{t('home.noNotifications')}</Text>
              ) : (
                <View>
                  {unreadNotifications.map((item, index) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.body}. ${t('home.markRead')}`}
                      onPress={() => markRead(item.id)}
                      className={`flex-row items-start gap-3 px-4 py-3.5 ${
                        index < unreadNotifications.length - 1 ? 'border-b border-line' : ''
                      }`}
                    >
                      <View className="mt-1.5 h-2 w-2 rounded-full bg-danger" />
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-semibold text-ink">{item.body}</Text>
                        <Text className="mt-1 text-xs font-medium text-muted">{t('home.unread')}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function blurActiveElement(): void {
  if (Platform.OS !== 'web') {
    return;
  }
  const active = globalThis.document?.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
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

function formatCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-IN');
}
