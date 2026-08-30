/**
 * CropCare Design System.
 *
 *  · "Sunrise Field" — soft pastel light theme (DEFAULT). Built for outdoor
 *    readability and for farmers who are not comfortable with dense UI: big
 *    touch targets, high-contrast ink on cream, colour used to mean something.
 *  · "Night Farm"   — dark theme for pre-dawn and late-night use.
 *  · Simple mode    — fewer, larger controls with plain words (default ON).
 *  · Elder mode     — +3 pt type everywhere and voice-first affordances.
 *
 * Contrast pairs are checked against WCAG AA (4.5:1 body, 3:1 large text).
 */
import React from 'react';
import { Platform } from 'react-native';

export type Palette = {
  mode: 'dark' | 'light';
  bg: string;
  bgAlt: string;
  gradient: [string, string, string];
  surface: string;
  surfaceStrong: string;
  glass: string;
  glassBorder: string;
  card: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  primaryDim: string;
  onPrimary: string;
  accent: string;
  soil: string;
  water: string;
  sun: string;
  danger: string;
  warn: string;
  ok: string;
  gradeA: string;
  gradeB: string;
  gradeC: string;
  shadow: string;
  /** Pastel tints used for tiles, chips and section washes. */
  tint: { mint: string; sky: string; blush: string; butter: string; lilac: string; peach: string; sand: string };
};

/** Sunrise Field — pastel light (default). */
export const light: Palette = {
  mode: 'light',
  bg: '#FFFBF4',
  bgAlt: '#FFF6EA',
  gradient: ['#FFFBF3', '#F4FAF0', '#EAF4F7'],
  surface: 'rgba(46,107,79,0.06)',
  surfaceStrong: 'rgba(46,107,79,0.11)',
  glass: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(46,107,79,0.14)',
  card: '#FFFFFF',
  text: '#22372B',
  textDim: '#5A7264',
  textFaint: '#8A9E92',
  primary: '#2E8B57',
  primaryDim: '#BFE6CE',
  onPrimary: '#FFFFFF',
  accent: '#E58F65',
  soil: '#C7A17A',
  water: '#5BA8D0',
  sun: '#E8A93C',
  danger: '#D25B52',
  warn: '#D69028',
  ok: '#2E8B57',
  gradeA: '#2E8B57',
  gradeB: '#D69028',
  gradeC: '#D25B52',
  shadow: '#8FA79A',
  tint: {
    mint: '#CDEFD8', sky: '#CDE7F5', blush: '#F8D6D0', butter: '#FBEFC0',
    lilac: '#DED3F0', peach: '#FBD9B7', sand: '#EFE3D0',
  },
};

/** Night Farm — dark. */
export const dark: Palette = {
  mode: 'dark',
  bg: '#0B1310',
  bgAlt: '#12201A',
  gradient: ['#0C1712', '#12241C', '#0A1410'],
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: 'rgba(255,255,255,0.10)',
  glass: 'rgba(180,240,205,0.06)',
  glassBorder: 'rgba(170,235,195,0.16)',
  card: 'rgba(255,255,255,0.06)',
  text: '#EDFBF2',
  textDim: '#A6C0B1',
  textFaint: '#728A7C',
  primary: '#7FE0A0',
  primaryDim: '#2F6B45',
  onPrimary: '#06180E',
  accent: '#F0A97B',
  soil: '#CBA07A',
  water: '#7FCDEB',
  sun: '#F5C86A',
  danger: '#FF8880',
  warn: '#F5B75F',
  ok: '#7FE0A0',
  gradeA: '#7FE0A0',
  gradeB: '#F5C86A',
  gradeC: '#F0A07B',
  shadow: '#000000',
  tint: {
    mint: '#1D3A2B', sky: '#1B3140', blush: '#3E2A28', butter: '#3A3320',
    lilac: '#2E2940', peach: '#3D2F22', sand: '#2C2A24',
  },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 18, lg: 24, xl: 30, pill: 999 };

export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 21, fontWeight: '800' as const, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '600' as const },
  micro: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
  mono: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
  },
};

export function shadow(p: Palette, level = 1) {
  return {
    shadowColor: p.shadow,
    shadowOpacity: p.mode === 'dark' ? 0.4 : 0.22,
    shadowRadius: 12 * level,
    shadowOffset: { width: 0, height: 5 * level },
    elevation: 4 * level,
  };
}

export type ThemeValue = {
  p: Palette;
  scheme: 'dark' | 'light';
  toggle: () => void;
  elder: boolean;
  setElder: (v: boolean) => void;
  simple: boolean;
  setSimple: (v: boolean) => void;
};

export const ThemeCtx = React.createContext<ThemeValue>({
  p: light,
  scheme: 'light',
  toggle: () => {},
  elder: false,
  setElder: () => {},
  simple: true,
  setSimple: () => {},
});

export const useTheme = () => React.useContext(ThemeCtx);

/** Elder mode bumps every font size by 3 pt for low-vision users (WCAG 1.4.4). */
export function scaleFont<T extends { fontSize: number }>(style: T, elder: boolean): T {
  return elder ? ({ ...style, fontSize: style.fontSize + 3 } as T) : style;
}

/** Minimum comfortable touch target; grows in elder mode (WCAG 2.5.5). */
export const touch = (elder: boolean) => (elder ? 60 : 48);
