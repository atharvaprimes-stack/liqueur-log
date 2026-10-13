import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { readPreference, writePreference } from '../data/local/preferences';
import i18n, { isAppLanguage } from '../i18n';
import { ThemeContext } from '../theme/theme-context';
import { isThemeId, palettes, themeVars, type ThemeId } from '../theme/themes';

const THEME_KEY = 'theme';
const LANGUAGE_KEY = 'language';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('dark');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedTheme, savedLanguage] = await Promise.all([
        readPreference(THEME_KEY),
        readPreference(LANGUAGE_KEY),
      ]);
      if (cancelled) {
        return;
      }
      if (isThemeId(savedTheme)) {
        setThemeState(savedTheme);
      }
      if (isAppLanguage(savedLanguage) && savedLanguage !== i18n.language) {
        await i18n.changeLanguage(savedLanguage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    void writePreference(THEME_KEY, next);
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = i18n.language.startsWith('mr') ? 'en' : 'mr';
    void i18n.changeLanguage(next);
    void writePreference(LANGUAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      palette: palettes[theme],
      themeStyle: themeVars[theme],
      setTheme,
      toggleLanguage,
    }),
    [setTheme, theme, toggleLanguage],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVars[theme]]} className="flex-1 bg-canvas">
        <StatusBar style={palettes[theme].statusBar} />
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export { useTheme } from '../theme/theme-context';
