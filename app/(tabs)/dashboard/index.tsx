import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../src/context/AuthContext';

export default function DashboardScreen() {
  const { currentUser, currentTenant, isReady, logout } = useAuth();

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  if (!currentUser || !currentTenant) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-950 px-6 pt-8">
      <Text className="text-xs font-semibold tracking-[3px] text-amber-400">
        {currentTenant.businessName.toUpperCase()}
      </Text>
      <Text className="mt-3 text-3xl font-semibold text-stone-50">Hello, {currentUser.name}</Text>
      <Text className="mt-2 text-base text-stone-400">
        Signed in as {currentUser.role === 'ADMIN' ? 'admin' : 'staff'}. This session ends after{' '}
        {currentTenant.inactivityTimeoutMinutes} minutes without interaction.
      </Text>

      {currentUser.role === 'ADMIN' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/dashboard/manage-staff')}
          className="mt-8 h-14 justify-center rounded-3xl bg-stone-900 px-5"
        >
          <Text className="text-lg font-medium text-stone-50">Manage staff</Text>
          <Text className="mt-1 text-sm text-stone-400">Add, edit, or deactivate people for this business.</Text>
        </Pressable>
      ) : (
        <View className="mt-8 rounded-3xl bg-stone-900 p-5">
          <Text className="text-base text-stone-300">
            Staff accounts can sign in and work in this business. They cannot manage other staff or business settings.
          </Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void logout().then(() => router.replace('/login'));
        }}
        className="mt-6 h-12 items-center justify-center rounded-2xl bg-stone-800"
      >
        <Text className="font-medium text-stone-100">Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}
