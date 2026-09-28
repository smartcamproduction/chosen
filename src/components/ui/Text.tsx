import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilyFor, typeScale, type Colors, type FontWeight, type TypeVariant } from '@/theme/tokens';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'violet'
  | 'amber'
  | 'danger'
  | 'onAccent'
  | 'inherit';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  weight?: FontWeight;
  align?: TextStyle['textAlign'];
  strike?: boolean;
  /** Force monospace numerals (Geist Mono). */
  mono?: boolean;
}

export function toneColor(c: Colors, tone: TextTone): string | undefined {
  switch (tone) {
    case 'primary':
      return c.text;
    case 'secondary':
      return c.textSecondary;
    case 'tertiary':
      return c.textTertiary;
    case 'accent':
      return c.accentText;
    case 'violet':
      return c.violet;
    case 'amber':
      return c.amber;
    case 'danger':
      return c.danger;
    case 'onAccent':
      return c.onAccent;
    case 'inherit':
      return undefined;
  }
}

/**
 * Dynamic Type: text follows the iPhone's text size setting. Big titles and
 * numbers grow less so layouts stay readable at the largest sizes.
 */
const MAX_SCALE: Record<TypeVariant, number> = {
  display: 1.3,
  h1: 1.35,
  h2: 1.5,
  h3: 1.6,
  bodyLg: 2,
  body: 2,
  bodySm: 2,
  caption: 1.8,
  label: 1.5,
  metricXl: 1.3,
  metricLg: 1.4,
  metricMd: 1.6,
  monoSm: 1.5,
};
/** Announced as headings by VoiceOver (unless a role is given). */
const HEADINGS: TypeVariant[] = ['display', 'h1', 'h2'];

export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  align,
  strike,
  mono,
  style,
  children,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const spec = typeScale[variant];
  const isMono = mono ?? ('mono' in spec && spec.mono === true);
  const caps = 'caps' in spec && spec.caps === true;
  const w = weight ?? spec.weight;

  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={rest.maxFontSizeMultiplier ?? MAX_SCALE[variant]}
      accessibilityRole={rest.accessibilityRole ?? (HEADINGS.includes(variant) ? 'header' : undefined)}
      style={[
        {
          fontFamily: fontFamilyFor(w, isMono),
          fontSize: spec.size,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.tracking * spec.size,
          color: toneColor(colors, tone),
          textAlign: align,
          textTransform: caps ? 'uppercase' : undefined,
          textDecorationLine: strike ? 'line-through' : undefined,
          fontVariant: isMono ? ['tabular-nums'] : undefined,
        },
        style,
      ]}>
      {children}
    </RNText>
  );
}
