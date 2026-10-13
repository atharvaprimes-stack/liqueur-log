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
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  tabBorderWidth: number;
  statusBar: 'light' | 'dark';
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
};

type ThemeDefinition = {
  channels: Channels;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  tabBorderWidth: number;
  statusBar: 'light' | 'dark';
};

const definitions: Record<ThemeId, ThemeDefinition> = {
  light: {
    channels: {
      canvas: '250 250 249',
      surface: '255 255 255',
      ink: '28 25 23',
      muted: '87 83 78',
      line: '214 211 209',
      accent: '180 83 9',
      accentInk: '255 251 235',
      danger: '185 28 28',
      success: '21 128 61',
    },
    tabBar: '#ffffff',
    tabActive: '#9a3412',
    tabInactive: '#78716c',
    tabBorderWidth: 1,
    statusBar: 'dark',
  },
  dark: {
    channels: {
      canvas: '12 10 9',
      surface: '28 25 23',
      ink: '250 250 249',
      muted: '168 162 158',
      line: '68 64 60',
      accent: '245 158 11',
      accentInk: '28 25 23',
      danger: '248 113 113',
      success: '74 222 128',
    },
    tabBar: '#0c0a09',
    tabActive: '#fbbf24',
    tabInactive: '#a8a29e',
    tabBorderWidth: 1,
    statusBar: 'light',
  },
  amber: {
    channels: {
      canvas: '20 8 0',
      surface: '48 22 4',
      ink: '255 248 235',
      muted: '255 214 140',
      line: '245 158 11',
      accent: '255 196 0',
      accentInk: '28 12 0',
      danger: '255 140 110',
      success: '167 243 208',
    },
    tabBar: '#140800',
    tabActive: '#ffe566',
    tabInactive: '#ffc46b',
    tabBorderWidth: 2,
    statusBar: 'light',
  },
};

function hex(channels: string): string {
  const [red, green, blue] = channels.split(' ').map((channel) => Number(channel));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function toPalette(definition: ThemeDefinition): ThemePalette {
  return {
    canvas: hex(definition.channels.canvas),
    surface: hex(definition.channels.surface),
    ink: hex(definition.channels.ink),
    muted: hex(definition.channels.muted),
    line: hex(definition.channels.line),
    accent: hex(definition.channels.accent),
    accentInk: hex(definition.channels.accentInk),
    danger: hex(definition.channels.danger),
    success: hex(definition.channels.success),
    tabBar: definition.tabBar,
    tabActive: definition.tabActive,
    tabInactive: definition.tabInactive,
    tabBorderWidth: definition.tabBorderWidth,
    statusBar: definition.statusBar,
  };
}

export const palettes: Record<ThemeId, ThemePalette> = {
  light: toPalette(definitions.light),
  dark: toPalette(definitions.dark),
  amber: toPalette(definitions.amber),
};

export const themeVars = {
  light: vars({
    '--color-canvas': definitions.light.channels.canvas,
    '--color-surface': definitions.light.channels.surface,
    '--color-ink': definitions.light.channels.ink,
    '--color-muted': definitions.light.channels.muted,
    '--color-line': definitions.light.channels.line,
    '--color-accent': definitions.light.channels.accent,
    '--color-accent-ink': definitions.light.channels.accentInk,
    '--color-danger': definitions.light.channels.danger,
    '--color-success': definitions.light.channels.success,
  }),
  dark: vars({
    '--color-canvas': definitions.dark.channels.canvas,
    '--color-surface': definitions.dark.channels.surface,
    '--color-ink': definitions.dark.channels.ink,
    '--color-muted': definitions.dark.channels.muted,
    '--color-line': definitions.dark.channels.line,
    '--color-accent': definitions.dark.channels.accent,
    '--color-accent-ink': definitions.dark.channels.accentInk,
    '--color-danger': definitions.dark.channels.danger,
    '--color-success': definitions.dark.channels.success,
  }),
  amber: vars({
    '--color-canvas': definitions.amber.channels.canvas,
    '--color-surface': definitions.amber.channels.surface,
    '--color-ink': definitions.amber.channels.ink,
    '--color-muted': definitions.amber.channels.muted,
    '--color-line': definitions.amber.channels.line,
    '--color-accent': definitions.amber.channels.accent,
    '--color-accent-ink': definitions.amber.channels.accentInk,
    '--color-danger': definitions.amber.channels.danger,
    '--color-success': definitions.amber.channels.success,
  }),
};

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}
