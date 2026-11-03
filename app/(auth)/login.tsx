import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FormScreen } from '../../src/components/FormScreen';
import { ScreenWrapper } from '../../src/components/ScreenWrapper';
import { useAuth } from '../../src/context/AuthContext';
import { AuthError } from '../../src/domain/errors';
import { useTheme } from '../../src/theme/theme-context';

/** Ignore taps that land on Login when Android dismisses the number pad. */
const SUBMIT_ARM_MS = 350;

export default function LoginScreen() {
  const { t } = useTranslation();
  const { height, width } = useWindowDimensions();
  const { palette } = useTheme();
  const bannerHeight = Math.max(width * (338 / 1024), height * 0.28);
  const { currentUser, isReady, login } = useAuth();
  const pinRef = useRef<TextInput>(null);
  const [mobileNumber, setMobileNumber] = useState('');
  const [mpin, setMpin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitArmed, setSubmitArmed] = useState(false);
  const submittingRef = useRef(false);
  const fieldsReady = mobileNumber.length === 10 && mpin.length === 4;
  const canSubmit = fieldsReady && submitArmed && !submitting;

  useEffect(() => {
    if (!fieldsReady) {
      setSubmitArmed(false);
      return;
    }
    // Android number-pad often fires a ghost press (or onSubmitEditing) on the
    // 4th PIN digit when maxLength is hit — wait before accepting Login taps.
    const timer = setTimeout(() => setSubmitArmed(true), SUBMIT_ARM_MS);
    return () => clearTimeout(timer);
  }, [fieldsReady]);

  if (isReady && currentUser) {
    return <Redirect href="/home" />;
  }

  const submit = async () => {
    if (submittingRef.current || !fieldsReady || !submitArmed) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    Keyboard.dismiss();
    try {
      await login(mobileNumber, mpin);
    } catch (loginError) {
      setError(loginError instanceof AuthError ? t(`auth.${loginError.reason}`) : t('auth.unavailable'));
      setMpin('');
      pinRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ScreenWrapper padded={false} header={false}>
      <FormScreen contentContainerClassName="grow pb-8">
        <Image
          accessibilityLabel={t('appName')}
          source={require('../../assets/login-banner.jpg')}
          resizeMode="stretch"
          style={{ width: '100%', height: bannerHeight }}
        />
        <View className="w-full max-w-[440px] self-center px-6 pt-8">
          <Text className="text-center text-display font-medium text-ink">{t('login.title')}</Text>

          <Text className="mb-2 mt-8 text-sm font-medium text-muted">{t('login.mobileLabel')}</Text>
          <TextInput
            value={mobileNumber}
            onChangeText={(value) => {
              setError(null);
              setMobileNumber(value.replace(/\D/g, '').slice(0, 10));
            }}
            placeholder={t('login.mobilePlaceholder')}
            placeholderTextColor={palette.muted}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={10}
            editable={!submitting}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => pinRef.current?.focus()}
            className={`min-h-14 rounded-xl border bg-canvas px-4 text-base text-ink ${
              error ? 'border-danger' : 'border-line'
            }`}
          />

          <Text className="mb-2 mt-5 text-sm font-medium text-muted">{t('login.mpinLabel')}</Text>
          <TextInput
            ref={pinRef}
            value={mpin}
            onChangeText={(value) => {
              setError(null);
              setMpin(value.replace(/\D/g, '').slice(0, 4));
            }}
            placeholder={t('login.mpinPlaceholder')}
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            secureTextEntry
            maxLength={4}
            editable={!submitting}
            // number-pad has no return key; do not auto-login on maxLength /
            // IME submit — Android OEMs often fire that when the 4th digit lands.
            blurOnSubmit
            className={`min-h-14 rounded-xl border bg-canvas px-4 text-base text-ink ${
              error ? 'border-danger' : 'border-line'
            }`}
          />

          <Text className="mt-3 min-h-5 text-sm text-danger" style={{ lineHeight: 20 }}>
            {error ?? ''}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() => {
              void submit();
            }}
            className="mt-4 h-14 items-center justify-center rounded-lg bg-accent disabled:opacity-40"
          >
            {submitting ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text className="text-base font-semibold text-accent-ink">{t('login.submit')}</Text>
            )}
          </Pressable>
        </View>
      </FormScreen>
    </ScreenWrapper>
  );
}
