import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useHaptics, type HapticKind } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type Colors } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accentOutline' | 'apple';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** Custom leading element (e.g. a brand logo). */
  leading?: ReactNode;
  sublabel?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  haptic?: HapticKind | null;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZES = {
  lg: { height: 56, radius: radius.lg, padX: space[5], font: 'bodyLg' as const, icon: 20 },
  md: { height: 48, radius: radius.md, padX: space[4], font: 'body' as const, icon: 18 },
  sm: { height: 36, radius: 10, padX: space[3], font: 'bodySm' as const, icon: 16 },
};

function variantColors(c: Colors, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { bg: c.accent, border: 'rgba(255,255,255,0.22)', fg: c.onAccent, tone: 'onAccent' as const };
    case 'secondary':
      return { bg: c.surface, border: c.borderStrong, fg: c.text, tone: 'primary' as const };
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', fg: c.textSecondary, tone: 'secondary' as const };
    case 'danger':
      return { bg: c.dangerSoft, border: c.dangerBorder, fg: c.danger, tone: 'danger' as const };
    case 'accentOutline':
      return { bg: c.elevated, border: c.accentBorder, fg: c.accentText, tone: 'accent' as const };
    case 'apple':
      return { bg: c.appleButton, border: 'transparent', fg: c.appleButtonText, tone: 'inherit' as const };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  leading,
  sublabel,
  disabled,
  loading,
  fullWidth = true,
  haptic = 'light',
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const s = SIZES[size];
  const v = variantColors(colors, variant);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? sublabel}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPressIn={() => scale.set(withTiming(0.98, { duration: 90 }))}
      onPressOut={() => scale.set(withTiming(1, { duration: 140 }))}
      onPress={() => {
        if (haptic) haptics(haptic);
        onPress?.();
      }}
      style={[
        styles.base,
        {
          minHeight: sublabel ? s.height + 16 : s.height,
          borderRadius: s.radius,
          paddingHorizontal: s.padX,
          backgroundColor: v.bg,
          borderColor: v.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.4 : 1,
        },
        variant === 'primary' && !isDisabled && { boxShadow: `0 0 32px ${colors.accentGlow}` },
        animatedStyle,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.column}>
          <View style={styles.row}>
            {leading}
            {icon ? <Icon icon={icon} size={s.icon} color={v.fg} strokeWidth={1.75} /> : null}
            <Text variant={s.font} weight="semibold" tone={v.tone} style={v.tone === 'inherit' ? { color: v.fg } : undefined} numberOfLines={1}>
              {label}
            </Text>
            {iconRight ? <Icon icon={iconRight} size={s.icon} color={v.fg} strokeWidth={1.75} /> : null}
          </View>
          {sublabel ? (
            <Text variant="caption" tone={v.tone} style={[{ opacity: 0.75 }, v.tone === 'inherit' ? { color: v.fg } : undefined]} align="center">
              {sublabel}
            </Text>
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    alignItems: 'center',
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
});
