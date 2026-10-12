import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/context/AuthContext';

export default function TabsLayout() {
  const { currentUser, isReady } = useAuth();

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0c0a09', borderTopColor: '#292524' },
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: '#a8a29e',
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
    </Tabs>
  );
}
