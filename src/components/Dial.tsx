import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { Text } from './ui';

/** The precision dial on the welcome screen. A slow-turning ring around a locked core. */
export function Dial({ size = 280, label }: { size?: number; label: string }) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);
  const c = size / 2;

  useEffect(() => {
    rotation.set(withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1, false));
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const r1 = c - 4; // outer hairline
  const r2 = c - 14; // dotted ring
  const r3 = c * 0.66; // inner disc
  const r4 = c * 0.48; // rotating dashed ring
  const tick = size * 0.06;

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.14} />
            <Stop offset="0.7" stopColor={colors.accent} stopOpacity={0.03} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={r1} fill="url(#dialGlow)" stroke={colors.borderStrong} strokeWidth={1} />
        <Circle cx={c} cy={c} r={r2} fill="none" stroke={colors.textTertiary} strokeWidth={1.5} strokeDasharray="1 7" strokeLinecap="round" />
        <Circle cx={c} cy={c} r={r3} fill={colors.surface} stroke={colors.borderActive} strokeWidth={1} />
        {/* Cardinal ticks */}
        <Line x1={c} y1={4} x2={c} y2={4 + tick} stroke={colors.accent} strokeWidth={2} />
        <Line x1={c} y1={size - 4} x2={c} y2={size - 4 - tick} stroke={colors.accent} strokeWidth={2} />
        <Line x1={4} y1={c} x2={4 + tick} y2={c} stroke={colors.accent} strokeWidth={2} />
        <Line x1={size - 4} y1={c} x2={size - 4 - tick} y2={c} stroke={colors.accent} strokeWidth={2} />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={r4} fill="none" stroke={colors.accentBorder} strokeWidth={1.5} strokeDasharray="6 6" />
        </Svg>
      </Animated.View>

      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={[styles.core, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
          <View style={[styles.inner, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
            <View style={[styles.led, { backgroundColor: colors.accent, boxShadow: `0 0 16px ${colors.accent}` }]} />
          </View>
          <Text variant="label" tone="secondary">
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 104,
    height: 104,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  inner: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  led: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
