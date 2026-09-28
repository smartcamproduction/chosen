import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

interface ProgressBarProps {
  /** 0 to 1 */
  value: number;
  height?: number;
  tone?: 'accent' | 'violet' | 'amber';
  /** Split the bar into equal segments (e.g. quiz steps, message allowance). */
  segments?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ProgressBar({ value, height = 6, tone = 'accent', segments, style, accessibilityLabel }: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const fill = tone === 'violet' ? colors.violet : tone === 'amber' ? colors.amber : colors.accent;
  const track = colors.chartMuted;

  if (segments) {
    const filled = Math.round(clamped * segments);
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: segments, now: filled }}
        style={[styles.segments, style]}>
        {Array.from({ length: segments }, (_, i) => (
          <View key={i} style={[styles.segment, { height, borderRadius: height / 2, backgroundColor: i < filled ? fill : track }]} />
        ))}
      </View>
    );
  }

  return <SmoothBar value={clamped} height={height} fill={fill} track={track} style={style} accessibilityLabel={accessibilityLabel} />;
}

function SmoothBar({
  value,
  height,
  fill,
  track,
  style,
  accessibilityLabel,
}: {
  value: number;
  height: number;
  fill: string;
  track: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(value, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [value, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: width * progress.value }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: fill }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
  },
});
