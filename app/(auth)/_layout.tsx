import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';

export default function AuthLayout() {
  const { currentUser, isReady, databaseError } = useAuth();

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (databaseError) {
    return <Redirect href="/" />;
  }

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
