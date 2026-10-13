import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';

export default function AuthLayout() {
  const { currentUser, isReady } = useAuth();

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
