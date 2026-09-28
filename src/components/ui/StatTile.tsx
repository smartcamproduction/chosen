import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

interface StatTileProps {
  label: string;
  value: string;
  /** Small unit after the value, e.g. "hrs/wk" or "/mo". */
  unit?: string;
  sub?: string;
  subTone?: TextTone;
  valueTone?: TextTone;
  icon?: LucideIcon;
  size?: 'md' | 'lg';
  variant?: 'elevated' | 'surface' | 'recessed';
  /** Extra content under the value (e.g. a meter). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A labelled metric: caps label, Geist Mono value, optional footnote. */
export function StatTile({
  label,
  value,
  unit,
  sub,
  subTone = 'secondary',
  valueTone = 'primary',
  icon,
  size = 'md',
  variant = 'elevated',
  children,
  style,
}: StatTileProps) {
  const { colors } = useTheme();
  const bg = variant === 'elevated' ? colors.elevated : variant === 'recessed' ? colors.recessed : colors.surface;

  return (
    <View style={[styles.tile, { backgroundColor: bg, borderColor: colors.border }, style]}>
      <View style={styles.head}>
        <Text variant="label" tone="secondary" style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {icon ? <Icon icon={icon} size={18} tone="secondary" /> : null}
      </View>
      <View style={styles.valueRow}>
        <Text variant={size === 'lg' ? 'metricXl' : 'metricLg'} tone={valueTone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.value}>
          {value}
        </Text>
        {unit ? (
          <Text variant="bodySm" tone="secondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {children}
      {sub ? (
        <Text variant="caption" tone={subTone}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[2],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[2],
  },
  label: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 4,
  },
  value: {
    flexShrink: 1,
  },
  unit: {
    flexShrink: 1,
  },
});
