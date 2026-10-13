import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NumericKeypad } from '../../src/components/NumericKeypad';
import { ScreenWrapper } from '../../src/components/ScreenWrapper';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/theme-context';
import { AuthError } from '../../src/domain/errors';

type Step = 'mobile' | 'mpin';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady, login } = useAuth();
  const [step, setStep] = useState<Step>('mobile');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mpin, setMpin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (isReady && currentUser) {
    return <Redirect href="/home" />;
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
      setError(loginError instanceof AuthError ? t(`auth.${loginError.reason}`) : t('auth.unavailable'));
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
    <ScreenWrapper padded={false}>
      <View className="flex-1 justify-between p-4">
        <View>
          <Text className="text-display font-semibold text-ink">{t('login.title')}</Text>
          <Text className="mt-2 text-body text-muted">
            {step === 'mobile' ? t('login.mobilePrompt') : t('login.mpinPrompt', { mobile: formatMobile(mobileNumber) })}
          </Text>
        </View>

        <View className="items-center">
          <Text className="text-center text-display font-medium tracking-[4px] text-ink">{display}</Text>
          <Text className="mt-3 text-base text-muted">
            {step === 'mobile' ? `${mobileNumber.length} / 10` : `${mpin.length} / 4`}
          </Text>
          {error ? <Text className="mt-4 text-center text-base text-danger">{error}</Text> : null}
          {submitting ? <ActivityIndicator className="mt-4" color={palette.accent} /> : null}
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
              <Text className="text-base font-semibold text-accent">{t('login.changeMobile')}</Text>
            </Pressable>
          ) : null}
          <NumericKeypad disabled={submitting} onDigit={onDigit} onDelete={onDelete} />
        </View>
      </View>
    </ScreenWrapper>
  );
}

function formatMobile(value: string): string {
  if (!value) {
    return '––––––––––';
  }
  return value.padEnd(10, '–');
}
