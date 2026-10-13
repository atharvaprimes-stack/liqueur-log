import { createContext, useContext } from 'react';

import { palettes, themeVars, type ThemeId, type ThemePalette } from './themes';

export type ThemeContextValue = {
  theme: ThemeId;
  palette: ThemePalette;
  themeStyle: (typeof themeVars)[ThemeId];
  setTheme: (theme: ThemeId) => void;
  toggleLanguage: () => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  palette: palettes.dark,
  themeStyle: themeVars.dark,
  setTheme: () => undefined,
  toggleLanguage: () => undefined,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
