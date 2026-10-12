import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';

export default function Index() {
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

  return <Redirect href={currentUser.role === 'ADMIN' ? '/dashboard/manage-staff' : '/dashboard'} />;
}
