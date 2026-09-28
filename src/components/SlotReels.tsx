import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { reelPhases, ROW_HEIGHT, VISIBLE_ROWS } from '@/lib/reelPhysics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Text } from './ui';

export { ROW_HEIGHT };

export interface ReelItem {
  label: string;
  sub?: string;
}

interface SlotReelsProps {
  /**
   * One strip per reel. The second-to-last item of each strip is where the
   * reel stops (it lands in the middle row).
   */
  strips: ReelItem[][];
  headers: string[];
  /** Change this number to start a spin. 0 = idle, no animation. */
  spinKey: number;
  /** Relative width of each reel (default: equal). */
  weights?: number[];
  /** A row passed the payline (used for light ticks). */
  onTick?: () => void;
  /** A reel stopped braking and locked onto its row. */
  onReelStop?: (index: number) => void;
  /** Every reel has settled. */
  onSettled?: () => void;
}

/**
 * Three vertical reels. Calm and precise: no flashing lights, just a fast
 * spin, staggered braking with a slight overshoot, and a small settle.
 */
export function SlotReels({ strips, headers, spinKey, weights, onTick, onReelStop, onSettled }: SlotReelsProps) {
  const { colors } = useTheme();
  const weight = (i: number) => weights?.[i] ?? 1;

  return (
    <View style={[styles.window, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
      <View style={styles.headers}>
        {headers.map((h, i) => (
          <Text key={h} variant="label" tone="tertiary" align="center" style={{ flex: weight(i) }} numberOfLines={1}>
            {h}
          </Text>
        ))}
      </View>

      <View style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}>
        {/* Payline band */}
        <View
          pointerEvents="none"
          style={[styles.band, { top: ROW_HEIGHT, height: ROW_HEIGHT, backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}
        />
        <View style={[styles.marker, styles.markerLeft, { top: ROW_HEIGHT + 24, backgroundColor: colors.accent }]} />
        <View style={[styles.marker, styles.markerRight, { top: ROW_HEIGHT + 24, backgroundColor: colors.accent }]} />

        <View style={styles.reels}>
          {strips.map((strip, i) => (
            <Reel
              key={i}
              index={i}
              strip={strip}
              spinKey={spinKey}
              divider={i > 0}
              weight={weight(i)}
              onTick={onTick}
              onStop={(idx) => onReelStop?.(idx)}
              onSettle={(idx) => {
                if (idx === strips.length - 1) onSettled?.();
              }}
            />
          ))}
        </View>

        <Fade position="top" color={colors.recessed} />
        <Fade position="bottom" color={colors.recessed} />
      </View>
    </View>
  );
}

function Reel({
  strip,
  index,
  spinKey,
  divider,
  weight,
  onTick,
  onStop,
  onSettle,
}: {
  strip: ReelItem[];
  index: number;
  spinKey: number;
  divider: boolean;
  weight: number;
  onTick?: () => void;
  onStop: (index: number) => void;
  onSettle: (index: number) => void;
}) {
  const { colors } = useTheme();
  const y = useSharedValue(0);
  const spinning = useSharedValue(0);
  const phases = reelPhases(strip.length);

  useEffect(() => {
    if (spinKey === 0) {
      y.set(phases.final);
      return;
    }
    spinning.set(1);
    y.set(0);
    y.set(
      withSequence(
        withTiming(phases.rampEnd, { duration: phases.rampMs, easing: Easing.in(Easing.quad) }),
        withTiming(phases.cruiseEnd, { duration: phases.cruiseMs, easing: Easing.linear }),
        withTiming(phases.brakeEnd, { duration: phases.brakeMs, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (!finished) return;
          spinning.set(0);
          scheduleOnRN(onStop, index);
        }),
        withSpring(phases.final, { damping: 14, stiffness: 220, mass: 0.8 }, (finished) => {
          if (finished) scheduleOnRN(onSettle, index);
        }),
      ),
    );
    // Only restart when a new spin is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  // Light tick every time a row passes the payline while spinning.
  useAnimatedReaction(
    () => Math.floor(-y.value / ROW_HEIGHT),
    (row, previous) => {
      if (onTick && spinning.value === 1 && previous !== null && row !== previous) scheduleOnRN(onTick);
    },
  );

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <View style={[styles.reel, { flex: weight }, divider && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
      <Animated.View style={style}>
        {strip.map((item, i) => (
          <View key={i} style={styles.item}>
            <Text variant="body" weight="semibold" align="center" numberOfLines={2} style={styles.label}>
              {item.label}
            </Text>
            {item.sub ? (
              <Text variant="caption" tone="secondary" align="center" numberOfLines={1}>
                {item.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function Fade({ position, color }: { position: 'top' | 'bottom'; color: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={[styles.fade, position === 'top' ? { top: 0 } : { bottom: 0 }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={position === 'top' ? 1 : 0} />
            <Stop offset="1" stopColor={color} stopOpacity={position === 'top' ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headers: {
    flexDirection: 'row',
    paddingTop: space[3],
    paddingBottom: space[1],
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  marker: {
    position: 'absolute',
    width: 4,
    height: 28,
    borderRadius: 2,
    zIndex: 2,
  },
  markerLeft: {
    left: 4,
  },
  markerRight: {
    right: 4,
  },
  reels: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  reel: {
    overflow: 'hidden',
  },
  item: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 2,
  },
  label: {
    fontSize: 15,
    lineHeight: 19,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT * 0.9,
  },
});
