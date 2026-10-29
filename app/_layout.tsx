import '../global.css';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, SessionTimeoutProvider } from '../src/context/AuthContext';
import { LedgerSyncProvider } from '../src/context/LedgerSyncContext';
import { TableRequestsProvider } from '../src/context/TableRequestsContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { ReceiptCaptureHost } from '../src/printing/ReceiptCaptureHost';
import '../src/i18n';

const styleSheet = StyleSheet as typeof StyleSheet & {
  setFlag?: (name: 'darkMode', value: 'class' | 'media') => void;
};
styleSheet.setFlag?.('darkMode', 'class');

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider preload={false}>
        <ThemeProvider>
          <AuthProvider>
            <LedgerSyncProvider>
              <TableRequestsProvider>
                <SessionTimeoutProvider>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                  <ReceiptCaptureHost />
                </SessionTimeoutProvider>
              </TableRequestsProvider>
            </LedgerSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
