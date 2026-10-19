import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useAuth } from '../../../src/context/AuthContext';
import { palettes, THEME_IDS, type ThemeId } from '../../../src/theme/themes';
import { useTheme } from '../../../src/theme/theme-context';

const THEME_LABELS: Record<ThemeId, 'menu.light' | 'menu.dark' | 'menu.amberCompact'> = {
  light: 'menu.light',
  dark: 'menu.dark',
  amber: 'menu.amberCompact',
};

const THEME_HINTS: Record<ThemeId, 'menu.lightHint' | 'menu.darkHint' | 'menu.amberHint'> = {
  light: 'menu.lightHint',
  dark: 'menu.darkHint',
  amber: 'menu.amberHint',
};

export default function MenuScreen() {
  const { t, i18n } = useTranslation();
  const { currentUser, logout } = useAuth();
  const { theme, setTheme, toggleLanguage, palette } = useTheme();
  const isAdmin = currentUser?.role === 'ADMIN';
  const language = i18n.language.startsWith('mr') ? 'mr' : 'en';

  return (
    <ScreenWrapper padded={false}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4 pb-10">
        <View className="overflow-hidden rounded-lg border border-line bg-surface">
          <View className="gap-2 px-4 py-3">
            <Text className="text-sm font-semibold text-muted">{t('menu.appearance')}</Text>
            <Text className="text-sm text-muted">{t('menu.appearanceBody')}</Text>
            <View className="flex-row gap-1 rounded-lg bg-canvas p-1">
              {THEME_IDS.map((option) => {
                const selected = theme === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityHint={t(THEME_HINTS[option])}
                    onPress={() => setTheme(option)}
                    className={`h-10 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-1 ${
                      selected ? 'bg-accent' : ''
                    }`}
                  >
                    <View
                      className="h-2.5 w-2.5 rounded-full border border-line"
                      style={{ backgroundColor: palettes[option].canvas }}
                    />
                    <Text
                      numberOfLines={1}
                      className={`shrink text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}
                    >
                      {t(THEME_LABELS[option])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-sm text-muted">{t(THEME_HINTS[theme])}</Text>
          </View>
          <View className="mx-4 h-px bg-line" />
          <View className="gap-2 px-4 py-3">
            <Text className="text-sm font-semibold text-muted">{t('menu.language')}</Text>
            <View className="flex-row gap-1 rounded-lg bg-canvas p-1">
              <LanguageOption
                label={t('menu.english')}
                selected={language === 'en'}
                onPress={() => {
                  if (language !== 'en') {
                    toggleLanguage();
                  }
                }}
              />
              <LanguageOption
                label={t('menu.marathi')}
                selected={language === 'mr'}
                onPress={() => {
                  if (language !== 'mr') {
                    toggleLanguage();
                  }
                }}
              />
            </View>
          </View>
        </View>

        <View className="overflow-hidden rounded-lg border border-line bg-surface">
          <SettingLink
            icon="person-circle-outline"
            title={t('menu.account')}
            hint={t('menu.accountHint')}
            isLast
            onPress={() => router.push('/menu/account')}
          />
        </View>

        {isAdmin ? (
          <View className="overflow-hidden rounded-lg border border-line bg-surface">
            <SettingLink
              icon="business-outline"
              title={t('menu.business')}
              hint={t('menu.businessHint')}
              onPress={() => router.push('/menu/business')}
            />
            <SettingLink
              icon="grid-outline"
              title={t('menu.floor')}
              hint={t('menu.floorHint')}
              onPress={() => router.push('/menu/tables')}
            />
            <SettingLink
              icon="pricetag-outline"
              title={t('menu.itemTypes')}
              hint={t('menu.itemTypesHint')}
              onPress={() => router.push({ pathname: '/menu/terms', params: { kind: 'type' } })}
            />
            <SettingLink
              icon="flash-outline"
              title={t('menu.strengths')}
              hint={t('menu.strengthsHint')}
              onPress={() => router.push({ pathname: '/menu/terms', params: { kind: 'strength' } })}
            />
            <SettingLink
              icon="cube-outline"
              title={t('menu.items')}
              hint={t('menu.itemsHint')}
              onPress={() => router.push('/menu/items')}
            />
            <SettingLink
              icon="storefront-outline"
              title={t('menu.vendors')}
              hint={t('menu.vendorsHint')}
              onPress={() => router.push('/menu/vendors')}
            />
            <SettingLink
              icon="people-outline"
              title={t('menu.staff')}
              hint={t('menu.staffHint')}
              isLast
              onPress={() => router.push('/menu/manage-staff')}
            />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.signOut')}
          onPress={() => {
            void logout().then(() => router.replace('/login'));
          }}
          className="h-12 flex-row items-center justify-center gap-2 rounded-lg border border-line bg-surface"
        >
          <Ionicons name="log-out-outline" size={18} color={palette.ink} />
          <Text className="text-base font-semibold text-ink">{t('common.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenWrapper>
  );
}

function LanguageOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-2 ${selected ? 'bg-accent' : ''}`}
    >
      <Text
        numberOfLines={1}
        className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}
        style={{ lineHeight: 20 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SettingLink({
  icon,
  title,
  hint,
  onPress,
  isLast = false,
}: {
  icon:
    | 'person-circle-outline'
    | 'business-outline'
    | 'grid-outline'
    | 'pricetag-outline'
    | 'flash-outline'
    | 'cube-outline'
    | 'storefront-outline'
    | 'archive-outline'
    | 'people-outline';
  title: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      className={`min-h-16 flex-row items-center gap-3 px-4 py-3 ${isLast ? '' : 'border-b border-line'}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-canvas">
        <Ionicons name={icon} size={18} color={palette.accent} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="mt-0.5 text-sm text-muted" numberOfLines={2}>
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </Pressable>
  );
}
