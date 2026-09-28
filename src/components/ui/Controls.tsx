import { Check, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

/* ---------- Toggle ---------- */

export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={(next) => {
        haptics('selection');
        onChange(next);
      }}
      trackColor={{ false: colors.chartMuted, true: colors.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.chartMuted}
    />
  );
}

/* ---------- Checkbox ---------- */

export function Checkbox({
  checked,
  onChange,
  accessibilityLabel,
  size = 24,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  accessibilityLabel?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  const box = (
    <View
      style={[
        styles.checkbox,
        {
          width: size,
          height: size,
          backgroundColor: checked ? colors.accent : colors.elevated,
          borderColor: checked ? colors.accent : colors.borderActive,
        },
      ]}>
      {checked ? <Check size={size * 0.7} color={colors.onAccent} strokeWidth={2.5} /> : null}
    </View>
  );
  if (!onChange) return box;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      hitSlop={10}
      onPress={() => {
        haptics(checked ? 'selection' : 'light');
        onChange(!checked);
      }}>
      {box}
    </Pressable>
  );
}

/* ---------- Segmented control ---------- */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  badge?: string;
  icon?: LucideIcon;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.recessed, borderColor: colors.border }, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
            onPress={() => {
              if (!selected) haptics('selection');
              onChange(opt.value);
            }}
            style={[
              styles.segment,
              { minHeight: size === 'sm' ? 34 : 42 },
              selected && { backgroundColor: colors.elevated, borderColor: colors.borderStrong },
            ]}>
            {opt.icon ? <Icon icon={opt.icon} size={15} tone={selected ? 'primary' : 'secondary'} /> : null}
            <Text variant={size === 'sm' ? 'bodySm' : 'body'} weight={selected ? 'semibold' : 'medium'} tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {opt.label}
            </Text>
            {opt.badge ? (
              <View style={[styles.segBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
                <Text variant="label" tone="accent">
                  {opt.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Icon button ---------- */

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 44,
  tone = 'primary',
  variant = 'surface',
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  tone?: TextTone;
  variant?: 'surface' | 'accent' | 'plain';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  const bg = variant === 'accent' ? colors.accent : variant === 'plain' ? 'transparent' : colors.surface;
  const border = variant === 'accent' ? colors.accent : variant === 'plain' ? 'transparent' : colors.borderStrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={() => {
        haptics('light');
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size >= 44 ? radius.md : 10, backgroundColor: bg, borderColor: border },
        pressed && { opacity: 0.75 },
        style,
      ]}>
      <Icon icon={icon} size={size >= 44 ? 20 : 18} tone={variant === 'accent' ? 'onAccent' : tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space[2],
  },
  segBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  iconButton: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
