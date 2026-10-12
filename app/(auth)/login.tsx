import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NumericKeypad } from '../../src/components/NumericKeypad';
import { useAuth } from '../../src/context/AuthContext';

type Step = 'mobile' | 'mpin';

export default function LoginScreen() {
  const { currentUser, isReady, login } = useAuth();
  const [step, setStep] = useState<Step>('mobile');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mpin, setMpin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (isReady && currentUser) {
    return <Redirect href={currentUser.role === 'ADMIN' ? '/dashboard/manage-staff' : '/dashboard'} />;
  }

  const submit = async (pin: string) => {
    if (submittingRef.current || mobileNumber.length !== 10 || pin.length !== 4) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(mobileNumber, pin);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
      setMpin('');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const onDigit = (digit: string) => {
    if (submitting) {
      return;
    }
    setError(null);
    if (step === 'mobile') {
      if (mobileNumber.length >= 10) {
        return;
      }
      const next = `${mobileNumber}${digit}`;
      setMobileNumber(next);
      if (next.length === 10) {
        setStep('mpin');
      }
      return;
    }

    if (mpin.length >= 4) {
      return;
    }
    const next = `${mpin}${digit}`;
    setMpin(next);
    if (next.length === 4) {
      void submit(next);
    }
  };

  const onDelete = () => {
    if (submitting) {
      return;
    }
    setError(null);
    if (step === 'mpin') {
      setMpin((current) => current.slice(0, -1));
      return;
    }
    setMobileNumber((current) => current.slice(0, -1));
  };

  const display = step === 'mobile' ? formatMobile(mobileNumber) : '•'.repeat(mpin.length).padEnd(4, '–');

  return (
    <SafeAreaView className="flex-1 bg-stone-950">
      <View className="flex-1 justify-between px-6 pb-4 pt-10">
        <View>
          <Text className="text-xs font-semibold tracking-[3px] text-amber-400">LIQUEUR LOG</Text>
          <Text className="mt-3 text-3xl font-semibold text-stone-50">Sign in</Text>
          <Text className="mt-2 text-base text-stone-400">
            {step === 'mobile'
              ? 'Enter the 10-digit mobile number issued for this business.'
              : `MPIN for ${formatMobile(mobileNumber)}`}
          </Text>
        </View>

        <View className="items-center">
          <Text className="text-center text-3xl font-medium tracking-[6px] text-stone-50">{display}</Text>
          <Text className="mt-3 text-sm text-stone-500">
            {step === 'mobile' ? `${mobileNumber.length} / 10` : `${mpin.length} / 4`}
          </Text>
          {error ? <Text className="mt-4 text-center text-sm text-red-400">{error}</Text> : null}
          {submitting ? <ActivityIndicator className="mt-4" color="#f59e0b" /> : null}
        </View>

        <View>
          {step === 'mpin' ? (
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => {
                setStep('mobile');
                setMpin('');
                setError(null);
              }}
              className="mb-4 items-center py-2"
            >
              <Text className="text-sm font-medium text-amber-400">Change mobile number</Text>
            </Pressable>
          ) : null}
          <NumericKeypad disabled={submitting} onDigit={onDigit} onDelete={onDelete} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatMobile(value: string): string {
  if (!value) {
    return '––––––––––';
  }
  return value.padEnd(10, '–');
}
