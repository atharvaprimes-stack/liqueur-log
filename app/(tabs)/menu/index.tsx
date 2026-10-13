import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { THEME_IDS, type ThemeId } from '../../../src/theme/themes';
import { useTheme } from '../../../src/theme/theme-context';

const THEME_LABELS: Record<ThemeId, 'menu.light' | 'menu.dark' | 'menu.amber'> = {
  light: 'menu.light',
  dark: 'menu.dark',
  amber: 'menu.amber',
};

export default function MenuScreen() {
  const { t, i18n } = useTranslation();
  const { currentUser, logout } = useAuth();
  const { theme, setTheme, toggleLanguage } = useTheme();
  const isAdmin = currentUser?.role === 'ADMIN';
  const language = i18n.language.startsWith('mr') ? 'mr' : 'en';

  return (
    <ScreenWrapper padded={false}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <Text className="text-display font-semibold text-ink">{t('menu.title')}</Text>

        <Text className="mt-8 text-title font-semibold text-ink">{t('menu.appearance')}</Text>
        <Text className="mt-2 text-body text-muted">{t('menu.appearanceBody')}</Text>
        <View className="mt-4 gap-3">
          {THEME_IDS.map((option) => {
            const selected = theme === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTheme(option)}
                className={`min-h-[72px] justify-center rounded-lg border px-5 py-4 ${
                  selected ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text className={`text-body font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>
                  {t(THEME_LABELS[option])}
                </Text>
                {option === 'amber' ? (
                  <Text className={`mt-1 text-sm ${selected ? 'text-accent-ink' : 'text-muted'}`}>
                    {t('menu.amberHint')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text className="mt-8 text-title font-semibold text-ink">{t('menu.language')}</Text>
        <View className="mt-4 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: language === 'en' }}
            onPress={() => {
              if (language !== 'en') {
                toggleLanguage();
              }
            }}
            className={`min-h-14 flex-1 items-center justify-center rounded-lg border px-3 py-3 ${
              language === 'en' ? 'border-accent bg-accent' : 'border-line bg-surface'
            }`}
          >
            <Text
              className={`text-center text-base font-semibold ${language === 'en' ? 'text-accent-ink' : 'text-ink'}`}
              style={{ lineHeight: 24 }}
            >
              {t('menu.english')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: language === 'mr' }}
            onPress={() => {
              if (language !== 'mr') {
                toggleLanguage();
              }
            }}
            className={`min-h-14 flex-1 items-center justify-center rounded-lg border px-3 py-3 ${
              language === 'mr' ? 'border-accent bg-accent' : 'border-line bg-surface'
            }`}
          >
            <Text
              className={`text-center text-base font-semibold ${language === 'mr' ? 'text-accent-ink' : 'text-ink'}`}
              style={{ lineHeight: 24 }}
            >
              {t('menu.marathi')}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-8 text-title font-semibold text-ink">{t('menu.staff')}</Text>
        <Text className="mt-2 text-body text-muted">{t(isAdmin ? 'menu.staffBody' : 'menu.staffDenied')}</Text>
        {isAdmin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/menu/manage-staff')}
            className="mt-4 h-14 items-center justify-center rounded-lg bg-accent"
          >
            <Text className="text-body font-semibold text-accent-ink">{t('menu.manageStaff')}</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void logout().then(() => router.replace('/login'));
          }}
          className="mt-8 h-14 items-center justify-center rounded-lg border border-line bg-surface"
        >
          <Text className="text-body font-semibold text-ink">{t('common.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenWrapper>
  );
}
