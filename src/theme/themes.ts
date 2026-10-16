import { Platform, type ViewStyle } from 'react-native';
import { vars } from 'nativewind';

export const THEME_IDS = ['light', 'dark', 'amber'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemePalette = {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  danger: string;
  success: string;
  idle: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  tabBorderWidth: number;
  statusBar: 'light' | 'dark';
  shadowColor: string;
  shadowOpacity: number;
  elevation: number;
};

type Channels = {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  danger: string;
  success: string;
  idle: string;
};

type ThemeDefinition = {
  channels: Channels;
  /** Prefer canvas (dark/amber) or surface (light) for the tab bar. */
  tabBarFrom: 'canvas' | 'surface';
  tabBorderWidth: number;
  statusBar: 'light' | 'dark';
  shadowColor: string;
  shadowOpacity: number;
  elevation: number;
};

const definitions: Record<ThemeId, ThemeDefinition> = {
  light: {
    channels: {
      canvas: '248 250 252', // #F8FAFC
      surface: '255 255 255', // #FFFFFF
      ink: '15 23 42', // #0F172A
      muted: '100 116 139', // #64748B
      line: '226 232 240', // #E2E8F0
      accent: '99 102 241', // #6366F1
      accentInk: '255 255 255', // #FFFFFF
      danger: '239 68 68', // #EF4444
      success: '16 185 129', // #10B981
      idle: '148 163 184', // #94A3B8
    },
    tabBarFrom: 'surface',
    tabBorderWidth: 1,
    statusBar: 'dark',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    elevation: 2,
  },
  dark: {
    channels: {
      canvas: '15 23 42', // #0F172A
      surface: '30 41 59', // #1E293B
      ink: '248 250 252', // #F8FAFC
      muted: '148 163 184', // #94A3B8
      line: '51 65 85', // #334155
      accent: '56 189 248', // #38BDF8
      accentInk: '15 23 42', // #0F172A
      danger: '248 113 113', // #F87171
      success: '52 211 153', // #34D399
      idle: '100 116 139', // #64748B
    },
    tabBarFrom: 'canvas',
    tabBorderWidth: 1,
    statusBar: 'light',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    elevation: 4,
  },
  amber: {
    channels: {
      canvas: '18 13 8', // #120D08
      surface: '33 23 16', // #211710
      ink: '253 230 138', // #FDE68A
      muted: '161 130 102', // #A18266 — warm muted (not cool purple)
      line: '61 43 31', // #3D2B1F
      accent: '245 158 11', // #F59E0B
      accentInk: '18 13 8', // #120D08
      danger: '239 68 68', // #EF4444
      success: '16 185 129', // #10B981
      idle: '120 53 15', // #78350F
    },
    tabBarFrom: 'canvas',
    tabBorderWidth: 1,
    statusBar: 'light',
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    elevation: 4,
  },
};

function hex(channels: string): string {
  const [red, green, blue] = channels.split(' ').map((channel) => Number(channel));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function toPalette(definition: ThemeDefinition): ThemePalette {
  const { channels } = definition;
  return {
    canvas: hex(channels.canvas),
    surface: hex(channels.surface),
    ink: hex(channels.ink),
    muted: hex(channels.muted),
    line: hex(channels.line),
    accent: hex(channels.accent),
    accentInk: hex(channels.accentInk),
    danger: hex(channels.danger),
    success: hex(channels.success),
    idle: hex(channels.idle),
    tabBar: hex(channels[definition.tabBarFrom]),
    tabActive: hex(channels.accent),
    tabInactive: hex(channels.muted),
    tabBorderWidth: definition.tabBorderWidth,
    statusBar: definition.statusBar,
    shadowColor: definition.shadowColor,
    shadowOpacity: definition.shadowOpacity,
    elevation: definition.elevation,
  };
}

export const palettes: Record<ThemeId, ThemePalette> = {
  light: toPalette(definitions.light),
  dark: toPalette(definitions.dark),
  amber: toPalette(definitions.amber),
};

/** Soft card elevation tuned per theme so surfaces lift cleanly in all modes. */
export function getCardShadow(palette: ThemePalette): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: palette.shadowColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: palette.shadowOpacity,
        shadowRadius: 14,
      },
      android: {
        elevation: palette.elevation,
      },
      default: {},
    }) ?? {}
  );
}

function themeStyle(definition: ThemeDefinition) {
  return vars({
    '--color-canvas': definition.channels.canvas,
    '--color-surface': definition.channels.surface,
    '--color-ink': definition.channels.ink,
    '--color-muted': definition.channels.muted,
    '--color-line': definition.channels.line,
    '--color-accent': definition.channels.accent,
    '--color-accent-ink': definition.channels.accentInk,
    '--color-danger': definition.channels.danger,
    '--color-success': definition.channels.success,
    '--color-idle': definition.channels.idle,
  });
}

export const themeVars = {
  light: themeStyle(definitions.light),
  dark: themeStyle(definitions.dark),
  amber: themeStyle(definitions.amber),
};

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}
