import { Redirect } from 'expo-router';

import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { currentUser, isReady } = useAuth();

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
