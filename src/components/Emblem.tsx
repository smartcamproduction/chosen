import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { Text } from './ui';

/**
 * Milestone emblem: a machined square with a crosshair and a glowing core.
 * Used on the celebration screen and the share card.
 */
export function Emblem({ size = 168, animate = true, cornerLabels }: { size?: number; animate?: boolean; cornerLabels?: [string, string] }) {
  const { colors } = useTheme();
  const scale = useSharedValue(animate ? 0.6 : 1);
  const opacity = useSharedValue(animate ? 0 : 1);
  const glow = useSharedValue(0.5);

  useEffect(() => {
    if (!animate) return;
    opacity.set(withTiming(1, { duration: 400 }));
    scale.set(withSpring(1, { damping: 12, stiffness: 140 }));
    glow.set(
      withDelay(
        500,
        withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0.5, { duration: 1400 })), -1, false),
      ),
    );
  }, [animate, opacity, scale, glow]);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const c = size / 2;
  const core = size * 0.2;

  return (
    <Animated.View style={[{ width: size, height: size }, wrapStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, styles.glowWrap, glowStyle]}>
        <View style={{ width: size * 0.9, height: size * 0.9, borderRadius: size, boxShadow: `0 0 80px ${colors.accentGlow}` }} />
      </Animated.View>
      <View style={[styles.box, { borderRadius: radius.xl + 4, backgroundColor: colors.elevated, borderColor: colors.borderActive }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={c} cy={c} r={size * 0.32} stroke={colors.accentBorder} strokeWidth={1.5} strokeDasharray="4 5" fill="none" />
          <Line x1={c} y1={size * 0.12} x2={c} y2={size * 0.3} stroke={colors.accentBorder} strokeWidth={1.5} />
          <Line x1={c} y1={size * 0.7} x2={c} y2={size * 0.88} stroke={colors.accentBorder} strokeWidth={1.5} />
          <Line x1={size * 0.12} y1={c} x2={size * 0.3} y2={c} stroke={colors.accentBorder} strokeWidth={1.5} />
          <Line x1={size * 0.7} y1={c} x2={size * 0.88} y2={c} stroke={colors.accentBorder} strokeWidth={1.5} />
        </Svg>
        <View
          style={{
            width: core * 1.9,
            height: core * 1.9,
            borderRadius: 10,
            transform: [{ rotate: '45deg' }],
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: colors.accent, boxShadow: `0 0 24px ${colors.accent}` }} />
        </View>
        {cornerLabels ? (
          <>
            <Text variant="monoSm" tone="tertiary" style={styles.cornerTL}>
              {cornerLabels[0]}
            </Text>
            <Text variant="monoSm" tone="accent" style={styles.cornerBR}>
              {cornerLabels[1]}
            </Text>
          </>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 12,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 12,
  },
});
