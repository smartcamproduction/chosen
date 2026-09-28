import { Zap } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { badgeInfo } from '@/data/badges';
import { levelKey } from '@/lib/progression';
import { useRewards, type RewardToastItem } from '@/state/RewardsProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, radius, space } from '@/theme/tokens';

import { Icon, IconTile, Row, Text } from './ui';

const VISIBLE_MS = 2600;
const EXIT_MS = 220;

/** Shows reward toasts one at a time, above everything (also above sheets on iOS). */
export function RewardToastHost() {
  const { toasts, dismissToast } = useRewards();
  const toast = toasts[0];
  if (!toast) return null;
  const content = <RewardToast key={toast.id} toast={toast} onDone={() => dismissToast(toast.id)} />;
  return Platform.OS === 'ios' ? <FullWindowOverlay>{content}</FullWindowOverlay> : content;
}

/** Small celebration: "+40 XP", level-ups and new badges, with a burst of confetti. */
function RewardToast({ toast, onDone }: { toast: RewardToastItem; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const show = useSharedValue(0);

  useEffect(() => {
    show.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    const hide = setTimeout(() => show.set(withTiming(0, { duration: EXIT_MS })), VISIBLE_MS);
    const done = setTimeout(onDone, VISIBLE_MS + EXIT_MS + 20);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
    // Runs once per toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ translateY: (1 - show.value) * -24 }, { scale: 0.96 + show.value * 0.04 }],
  }));

  const cardWidth = Math.min(width - GUTTER * 2, 420);
  const badgeOnly = toast.xp <= 0 && !toast.levelUp;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.host, { paddingTop: insets.top + space[2] }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.card,
          { width: cardWidth, backgroundColor: colors.elevated, borderColor: colors.accentBorder, boxShadow: `0 8px 32px ${colors.accentGlow}` },
          cardStyle,
        ]}>
        <Confetti width={cardWidth} />
        {badgeOnly ? null : (
          <Row gap={space[2]}>
            <Icon icon={Zap} size={20} tone="accent" />
            <Text variant="metricLg" tone="accent">
              {t('rewards.xp', { xp: toast.xp })}
            </Text>
            {toast.levelUp != null ? (
              <Text variant="bodySm" weight="semibold" style={styles.flex} numberOfLines={1} align="right">
                {t('rewards.levelUp', { level: toast.levelUp, name: t(levelKey(toast.levelUp)) })}
              </Text>
            ) : null}
          </Row>
        )}
        {toast.badges.map((id) => {
          const info = badgeInfo(id);
          if (!info) return null;
          return (
            <Row key={id} gap={space[3]} style={!badgeOnly || id !== toast.badges[0] ? styles.badgeRow : undefined}>
              <IconTile icon={info.icon} tone={info.tone} size={36} />
              <View style={styles.flex}>
                <Text variant="label" tone="secondary">
                  {t('rewards.badgeUnlocked')}
                </Text>
                <Text variant="body" weight="semibold" numberOfLines={1}>
                  {t(`badges.${id}.title`)}
                </Text>
              </View>
            </Row>
          );
        })}
      </Animated.View>
    </View>
  );
}

/** A quick, subtle burst of emerald, amber and violet specks. */
function Confetti({ width }: { width: number }) {
  const { colors } = useTheme();
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
        const distance = 40 + ((i * 37) % 50);
        return {
          dx: Math.cos(angle) * distance * 1.6,
          dy: Math.sin(angle) * distance * 0.7,
          size: 4 + (i % 3),
          color: i % 3 === 0 ? colors.amber : i % 3 === 1 ? colors.accent : colors.violet,
          delay: (i % 4) * 30,
        };
      }),
    [colors],
  );
  return (
    <View pointerEvents="none" style={[styles.confetti, { left: width / 2 }]}>
      {pieces.map((p, i) => (
        <Speck key={i} {...p} />
      ))}
    </View>
  );
}

function Speck({ dx, dy, size, color, delay }: { dx: number; dy: number; size: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
    transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { rotate: `${t.value * 180}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: 1.5, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[2],
    overflow: 'visible',
  },
  flex: {
    flex: 1,
  },
  badgeRow: {
    marginTop: space[1],
  },
  confetti: {
    position: 'absolute',
    top: '50%',
  },
});
