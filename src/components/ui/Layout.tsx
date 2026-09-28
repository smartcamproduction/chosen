import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

/* ---------- Section header: caps label left, optional note right ---------- */

export function SectionHeader({
  label,
  right,
  rightTone = 'secondary',
  dot,
  style,
}: {
  label: string;
  right?: ReactNode;
  rightTone?: TextTone;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionLeft}>
        {dot ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
        <Text variant="label" tone="secondary" style={styles.flexShrink}>
          {label}
        </Text>
      </View>
      {typeof right === 'string' ? (
        <Text variant="bodySm" tone={rightTone} numberOfLines={1} style={styles.flexShrink}>
          {right}
        </Text>
      ) : (
        right
      )}
    </View>
  );
}

/* ---------- List row (settings, resources) ---------- */

export function ListRow({
  icon,
  iconTone = 'secondary',
  title,
  sub,
  right,
  onPress,
  chevron,
  divider,
  titleTone = 'primary',
  accessibilityLabel,
}: {
  icon?: LucideIcon;
  iconTone?: TextTone;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  titleTone?: TextTone;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
      {icon ? <Icon icon={icon} size={20} tone={iconTone} /> : null}
      <View style={styles.rowText}>
        <Text variant="body" weight="medium" tone={titleTone}>
          {title}
        </Text>
        {sub ? (
          <Text variant="caption" tone="secondary">
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon icon={ChevronRight} size={18} tone="tertiary" /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

/* ---------- Hairline divider ---------- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.divider }, style]} />;
}

/* ---------- Bar meter (difficulty, intensity) ---------- */

export function Meter({ value, max = 5, tone = 'accent' }: { value: number; max?: number; tone?: 'accent' | 'amber' | 'violet' }) {
  const { colors } = useTheme();
  const fill = tone === 'amber' ? colors.amber : tone === 'violet' ? colors.violet : colors.accent;
  return (
    <View style={styles.meter} accessibilityLabel={`${value} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={[styles.meterBar, { backgroundColor: i < value ? fill : colors.chartMuted }]} />
      ))}
    </View>
  );
}

/* ---------- Icon tile (square with icon) ---------- */

export function IconTile({
  icon,
  tone = 'accent',
  size = 40,
  style,
}: {
  icon: LucideIcon;
  tone?: 'accent' | 'violet' | 'amber' | 'neutral' | 'danger';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const map = {
    accent: { bg: colors.accentSoft, border: colors.accentBorder, fg: 'accent' as const },
    violet: { bg: colors.violetSoft, border: colors.violetBorder, fg: 'violet' as const },
    amber: { bg: colors.amberSoft, border: colors.amberBorder, fg: 'amber' as const },
    danger: { bg: colors.dangerSoft, border: colors.dangerBorder, fg: 'danger' as const },
    neutral: { bg: colors.elevated, border: colors.border, fg: 'secondary' as const },
  }[tone];
  return (
    <View
      style={[
        styles.iconTile,
        { width: size, height: size, borderRadius: size >= 44 ? radius.md : 10, backgroundColor: map.bg, borderColor: map.border },
        style,
      ]}>
      <Icon icon={icon} size={Math.round(size * 0.5)} tone={map.fg} />
    </View>
  );
}

/** Horizontal stack with a gap. */
export function Row({ children, gap = space[3], style, align = 'center' }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    flexShrink: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  meter: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
  },
  meterBar: {
    width: 7,
    height: 16,
    borderRadius: 2,
  },
  iconTile: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
