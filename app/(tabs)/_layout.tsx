import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { Dimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/theme-context';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { currentUser, isReady } = useAuth();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const isAdmin = currentUser?.role === 'ADMIN';
  const tabBarPaddingBottom = bottomNavigationInset(insets.bottom);
  const tabBarHeight = 64 + tabBarPaddingBottom;

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.tabActive,
        tabBarInactiveTintColor: palette.tabInactive,
        tabBarStyle: {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.line,
          borderTopWidth: palette.tabBorderWidth,
          height: tabBarHeight,
          paddingTop: 4,
          paddingBottom: tabBarPaddingBottom,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: t('tabs.tables'),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('tabs.stock'),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="package-variant" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
          href: isAdmin ? '/reports' : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t('tabs.menu'),
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

function bottomNavigationInset(reportedBottom: number): number {
  if (reportedBottom > 0 || Platform.OS !== 'android') {
    return reportedBottom;
  }

  const screenHeight = Dimensions.get('screen').height;
  const windowHeight = Dimensions.get('window').height;
  const statusBarHeight = StatusBar.currentHeight ?? 0;
  const measured = Math.round(screenHeight - windowHeight - statusBarHeight);
  // Three-button navigation is about 48dp. A zero safe-area report still
  // leaves those buttons drawn over the tab labels.
  return measured > 0 ? measured : 48;
}
