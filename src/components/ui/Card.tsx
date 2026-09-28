import type { ReactNode } from 'react';
import { Pressable, View, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type CardVariant = 'default' | 'elevated' | 'recessed' | 'accent' | 'highlight' | 'ghost';

interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  /** Inner padding (defaults to 20). */
  padding?: number;
  radius?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** e.g. "alert" for error cards (read out by VoiceOver). */
  accessibilityRole?: AccessibilityRole;
}

/**
 * Surface container.
 * default   – standard card (#16181C + hairline)
 * elevated  – inner tiles / interactive surfaces (#1D2025)
 * recessed  – data wells and inputs
 * accent    – selected / premium card with emerald border and soft glow
 * highlight – card with an emerald bar on the left (directives, active steps)
 */
export function Card({ children, variant = 'default', padding = space[5], radius: r = radius.xl, onPress, style, accessibilityLabel, accessibilityRole }: CardProps) {
  const { colors } = useTheme();

  const base: ViewStyle = {
    borderRadius: r,
    padding,
    borderWidth: 1,
    overflow: 'hidden',
  };

  const variants: Record<CardVariant, ViewStyle> = {
    default: { backgroundColor: colors.surface, borderColor: colors.border },
    elevated: { backgroundColor: colors.elevated, borderColor: colors.borderStrong },
    recessed: { backgroundColor: colors.recessed, borderColor: colors.border },
    accent: {
      backgroundColor: colors.surface,
      borderColor: colors.accentBorder,
      boxShadow: `0 0 32px ${colors.accentGlow}`,
      overflow: 'visible',
    },
    highlight: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    ghost: { backgroundColor: 'transparent', borderColor: colors.border },
  };

  const content = [base, variants[variant], style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [content, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={content} accessibilityRole={accessibilityRole}>
      {children}
    </View>
  );
}
