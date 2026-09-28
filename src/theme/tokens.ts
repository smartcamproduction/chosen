/**
 * Design tokens for Chosen ("Graphite Precision").
 * Every color, font, spacing and radius used in the app comes from here,
 * so the look can be tuned in one place.
 */

export type Scheme = 'dark' | 'light';

export interface Colors {
  // Canvases & surfaces
  bg: string;
  surface: string;
  elevated: string;
  recessed: string;
  overlay: string;
  tabBar: string;

  // Hairlines
  border: string;
  borderStrong: string;
  borderActive: string;
  divider: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;

  // Emerald accent (fills use `accent`, text on the canvas uses `accentText`)
  accent: string;
  accentText: string;
  onAccent: string;
  accentSoft: string;
  accentBorder: string;
  accentGlow: string;

  violet: string;
  violetSoft: string;
  violetBorder: string;

  amber: string;
  amberSoft: string;
  amberBorder: string;

  danger: string;
  dangerSoft: string;
  dangerBorder: string;

  // Chat bubbles
  userBubble: string;
  userBubbleText: string;

  // Chart helpers
  chartMuted: string;
  chartCost: string;

  // Buttons with platform branding
  appleButton: string;
  appleButtonText: string;

  backdrop: string;
}

export const palette: Record<Scheme, Colors> = {
  dark: {
    bg: '#0E0F11',
    surface: '#16181C',
    elevated: '#1D2025',
    recessed: '#0A0B0D',
    overlay: 'rgba(29, 32, 37, 0.72)',
    tabBar: '#121316',

    border: 'rgba(255, 255, 255, 0.06)',
    borderStrong: 'rgba(255, 255, 255, 0.10)',
    borderActive: 'rgba(255, 255, 255, 0.14)',
    divider: 'rgba(255, 255, 255, 0.04)',

    text: '#F2F3F5',
    textSecondary: '#9A9FA8',
    textTertiary: '#585D69',

    accent: '#2FD37F',
    accentText: '#2FD37F',
    onAccent: '#0E0F11',
    accentSoft: 'rgba(47, 211, 127, 0.08)',
    accentBorder: 'rgba(47, 211, 127, 0.20)',
    accentGlow: 'rgba(47, 211, 127, 0.12)',

    violet: '#8B7CFF',
    violetSoft: 'rgba(139, 124, 255, 0.10)',
    violetBorder: 'rgba(139, 124, 255, 0.24)',

    amber: '#E5A93C',
    amberSoft: 'rgba(229, 169, 60, 0.10)',
    amberBorder: 'rgba(229, 169, 60, 0.24)',

    danger: '#F2645E',
    dangerSoft: 'rgba(242, 100, 94, 0.08)',
    dangerBorder: 'rgba(242, 100, 94, 0.24)',

    userBubble: '#3A2F9E',
    userBubbleText: '#E4DFFF',

    chartMuted: '#262A31',
    chartCost: '#8A6A62',

    appleButton: '#F2F3F5',
    appleButtonText: '#0E0F11',

    backdrop: 'rgba(0, 0, 0, 0.55)',
  },
  light: {
    bg: '#F7F7F8',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    recessed: '#F0F1F3',
    overlay: 'rgba(255, 255, 255, 0.80)',
    tabBar: '#FFFFFF',

    border: 'rgba(14, 15, 17, 0.08)',
    borderStrong: 'rgba(14, 15, 17, 0.12)',
    borderActive: 'rgba(14, 15, 17, 0.20)',
    divider: 'rgba(14, 15, 17, 0.05)',

    text: '#0E0F11',
    textSecondary: '#5B606B',
    textTertiary: '#8E939D',

    accent: '#2FD37F',
    accentText: '#0A7F48',
    onAccent: '#0E0F11',
    accentSoft: 'rgba(47, 211, 127, 0.12)',
    accentBorder: 'rgba(10, 127, 72, 0.24)',
    accentGlow: 'rgba(47, 211, 127, 0.18)',

    violet: '#5B4BE0',
    violetSoft: 'rgba(91, 75, 224, 0.08)',
    violetBorder: 'rgba(91, 75, 224, 0.22)',

    amber: '#A86A00',
    amberSoft: 'rgba(229, 169, 60, 0.14)',
    amberBorder: 'rgba(168, 106, 0, 0.24)',

    danger: '#D23B36',
    dangerSoft: 'rgba(210, 59, 54, 0.06)',
    dangerBorder: 'rgba(210, 59, 54, 0.22)',

    userBubble: '#ECE9FF',
    userBubbleText: '#261B86',

    chartMuted: '#E6E7EA',
    chartCost: '#C9A59C',

    appleButton: '#0E0F11',
    appleButtonText: '#FFFFFF',

    backdrop: 'rgba(14, 15, 17, 0.35)',
  },
};

/** 8pt grid (with 4pt half-steps for compact controls). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  round: 999,
} as const;

/** Outer screen margin used by every screen. */
export const GUTTER = space[4];

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

interface TypeStyle {
  size: number;
  lineHeight: number;
  /** Letter spacing in em (converted to px at render time). */
  tracking: number;
  weight: FontWeight;
  mono?: boolean;
  caps?: boolean;
}

export const typeScale = {
  display: { size: 34, lineHeight: 40, tracking: -0.03, weight: 'semibold' },
  h1: { size: 28, lineHeight: 34, tracking: -0.025, weight: 'semibold' },
  h2: { size: 22, lineHeight: 28, tracking: -0.02, weight: 'semibold' },
  h3: { size: 18, lineHeight: 24, tracking: -0.015, weight: 'semibold' },
  bodyLg: { size: 16, lineHeight: 24, tracking: -0.01, weight: 'regular' },
  body: { size: 14, lineHeight: 20, tracking: -0.005, weight: 'regular' },
  bodySm: { size: 13, lineHeight: 18, tracking: 0, weight: 'regular' },
  caption: { size: 12, lineHeight: 16, tracking: 0, weight: 'regular' },
  label: { size: 11, lineHeight: 14, tracking: 0.06, weight: 'semibold', caps: true },
  metricXl: { size: 34, lineHeight: 40, tracking: -0.03, weight: 'semibold', mono: true },
  metricLg: { size: 22, lineHeight: 28, tracking: -0.02, weight: 'medium', mono: true },
  metricMd: { size: 15, lineHeight: 20, tracking: 0, weight: 'medium', mono: true },
  monoSm: { size: 12, lineHeight: 16, tracking: 0, weight: 'regular', mono: true },
} satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typeScale;

export function fontFamilyFor(weight: FontWeight, mono = false): string {
  if (mono) {
    if (weight === 'regular') return fonts.mono;
    if (weight === 'medium') return fonts.monoMedium;
    return fonts.monoSemibold;
  }
  return fonts[weight];
}
