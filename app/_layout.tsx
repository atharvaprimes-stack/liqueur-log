import '../global.css';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, SessionTimeoutProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import '../src/i18n';

const styleSheet = StyleSheet as typeof StyleSheet & {
  setFlag?: (name: 'darkMode', value: 'class' | 'media') => void;
};
styleSheet.setFlag?.('darkMode', 'class');

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SessionTimeoutProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
          </SessionTimeoutProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
