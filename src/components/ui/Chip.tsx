import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type Colors } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

export type ChipTone = 'neutral' | 'accent' | 'violet' | 'amber' | 'danger' | 'solid';

interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: LucideIcon;
  /** Small status dot before the label. */
  dot?: boolean;
  /** Uppercase micro-label style (default) or sentence case. */
  caps?: boolean;
  size?: 'sm' | 'md';
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function toneStyle(c: Colors, tone: ChipTone): { bg: string; border: string; text: TextTone; dot: string } {
  switch (tone) {
    case 'accent':
      return { bg: c.accentSoft, border: c.accentBorder, text: 'accent', dot: c.accent };
    case 'violet':
      return { bg: c.violetSoft, border: c.violetBorder, text: 'violet', dot: c.violet };
    case 'amber':
      return { bg: c.amberSoft, border: c.amberBorder, text: 'amber', dot: c.amber };
    case 'danger':
      return { bg: c.dangerSoft, border: c.dangerBorder, text: 'danger', dot: c.danger };
    case 'solid':
      return { bg: c.accent, border: c.accent, text: 'onAccent', dot: c.onAccent };
    default:
      return { bg: c.elevated, border: c.border, text: 'secondary', dot: c.textSecondary };
  }
}

/** Rectangular status tag (8px radius — never a full pill). */
export function Chip({ label, tone = 'neutral', icon, dot, caps = true, size = 'sm', selected, onPress, style }: ChipProps) {
  const { colors } = useTheme();
  const t = toneStyle(colors, selected ? 'accent' : tone);

  const body = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: t.bg,
          borderColor: selected ? colors.accentBorder : t.border,
          paddingVertical: size === 'md' ? 8 : 4,
          paddingHorizontal: size === 'md' ? space[3] : space[2],
        },
        style,
      ]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      {icon ? <Icon icon={icon} size={size === 'md' ? 16 : 13} tone={t.text} strokeWidth={1.75} /> : null}
      <Text
        variant={caps ? 'label' : size === 'md' ? 'body' : 'bodySm'}
        weight={caps ? 'semibold' : 'medium'}
        tone={t.text}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.8 }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
