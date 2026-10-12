import '../global.css';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, SessionTimeoutProvider } from '../src/context/AuthContext';

const styleSheet = StyleSheet as typeof StyleSheet & {
  setFlag?: (name: 'darkMode', value: 'class' | 'media') => void;
};
styleSheet.setFlag?.('darkMode', 'class');

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SessionTimeoutProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c0a09' } }} />
        </SessionTimeoutProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
