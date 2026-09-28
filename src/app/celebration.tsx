import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, BadgeCheck, ChartColumn, Dices, Flame, Share, X, Zap } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Emblem } from '@/components/Emblem';
import { LogoMark } from '@/components/LogoMark';
import { Screen } from '@/components/Screen';
import { Card, Chip, Icon, IconButton, IconTile, Row, StatTile, Text } from '@/components/ui';
import type { Rank } from '@/lib/database.types';
import { formatNumber, pad2 } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { RANKS, rankIndex } from '@/lib/progression';
import { askForReviewAfter } from '@/lib/review';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useAccount } from '@/state/AccountProvider';
import { useMoney, useProgress, useRoadmap } from '@/state/hooks';
import { useHustles } from '@/state/HustlesProvider';
import { useProgressData } from '@/state/ProgressProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, radius, space } from '@/theme/tokens';

const isRank = (v: unknown): v is Rank => typeof v === 'string' && RANKS.some((r) => r.key === v);

/**
 * Full-screen celebration for a rank-up or a finished roadmap.
 * Opened automatically (see RewardsProvider) with:
 *   kind=rank&from=earner&to=operator   or   kind=roadmap&uh=<user hustle id>
 */
export default function Celebration() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; from?: string; to?: string; uh?: string }>();
  const { userHustles } = useAccount();
  const { byId } = useHustles();
  const { stepProgress, checkins } = useProgressData();
  const progress = useProgress();
  const money = useMoney();
  const main = useRoadmap(1);
  const reduceMotion = useReducedMotion();

  const kind: 'rank' | 'roadmap' = params.kind === 'roadmap' ? 'roadmap' : 'rank';
  const to: Rank = isRank(params.to) ? params.to : progress.rank;
  const from: Rank | null = isRank(params.from) ? params.from : null;
  const uh = userHustles.find((u) => u.id === params.uh) ?? main.userHustle;
  const hustle = (uh && byId(uh.hustle_id)) ?? main.hustle;

  // Rank-up: all-time numbers. Roadmap: this hustle's numbers.
  const scoped = kind === 'roadmap' && uh ? checkins.filter((c) => c.user_hustle_id === uh.id) : checkins;
  const net = scoped.reduce((sum, c) => sum + money.amounts(c).net, 0);
  const hours = scoped.reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
  const steps = kind === 'roadmap' && uh ? stepProgress.filter((s) => s.user_hustle_id === uh.id).length : stepProgress.length;

  useEffect(() => {
    haptics('success');
    // Fire once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  // Closing the celebration (not jumping somewhere else from it): ask for
  // an App Store rating. Native prompt, limited, never linked to a reward.
  const dismiss = () => {
    close();
    askForReviewAfter(kind === 'rank' ? 'rank_up' : 'roadmap_complete');
  };
  const goTo = (href: '/coach' | '/machine' | '/progress') => {
    close();
    if (href === '/machine') router.push('/machine');
    else router.navigate(href);
  };

  const header = (
    <Row style={[styles.header, { paddingTop: insets.top > 0 ? 0 : space[3] }]}>
      <Row gap={space[3]}>
        <LogoMark size={36} />
        <Text variant="label">{t('celebration.title')}</Text>
      </Row>
      <IconButton icon={X} accessibilityLabel={t('common.close')} onPress={dismiss} />
    </Row>
  );

  const rankNo = rankIndex(to) + 1;

  return (
    <View style={styles.flex}>
      <Screen header={header} gap={space[4]}>
        <Chip label={kind === 'rank' ? t('celebration.badgeRank', { n: rankNo }) : t('celebration.badgeRoadmap')} dot tone="accent" style={styles.center} />
        <View style={styles.emblem}>
          <Emblem size={168} cornerLabels={kind === 'rank' ? [`R-${pad2(rankNo)}`, t(`ranks.${to}`).toUpperCase()] : [`${steps}/${steps}`, 'DONE']} />
        </View>

        {kind === 'rank' && from ? (
          <Row gap={space[2]} style={styles.center}>
            <Text variant="label" tone="tertiary" strike>
              {t(`ranks.${from}`)}
            </Text>
            <Icon icon={ArrowRight} size={14} tone="accent" />
            <Text variant="label" tone="accent">
              {t(`ranks.${to}`)}
            </Text>
          </Row>
        ) : null}
        <Text variant="display" align="center">
          {kind === 'rank' ? t('celebration.headingRank', { rank: t(`ranks.${to}`) }) : t('celebration.headingRoadmap')}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {kind === 'rank'
            ? t('celebration.bodyRank', { amount: money.format(money.allTime, { decimals: 0 }) })
            : t('celebration.bodyRoadmap', { hustle: l(hustle.name) })}
        </Text>

        <Row gap={space[2]}>
          <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.accentBorder }]}>
            <Icon icon={Zap} size={18} tone="accent" />
            <View style={styles.shrink}>
              <Text variant="metricMd" tone="accent" numberOfLines={1}>
                {t('celebration.xpTotal', { xp: formatNumber(progress.xp, language) })}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('celebration.levelN', { level: progress.level })}
              </Text>
            </View>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.amberBorder }]}>
            <Icon icon={Flame} size={18} tone="amber" />
            <View style={styles.shrink}>
              <Text variant="body" weight="semibold" tone="amber" numberOfLines={1}>
                {t('celebration.streakDays', { count: progress.streak })}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('celebration.bestStreak', { count: progress.bestStreak })}
              </Text>
            </View>
          </View>
        </Row>

        <Card>
          <Row gap={space[2]}>
            <Icon icon={BadgeCheck} size={18} tone="accent" />
            <Text variant="label" tone="secondary">
              {kind === 'rank' ? t('celebration.summaryAll') : t('celebration.summaryHustle')}
            </Text>
          </Row>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatTile label={t('celebration.totalProfit')} value={money.format(net, { decimals: 0 })} valueTone={net >= 0 ? 'accent' : 'danger'} />
              <StatTile label={t('celebration.effort')} value={formatNumber(hours, language, 0)} unit={t('common.hrs')} />
            </View>
            <View style={styles.gridRow}>
              <StatTile label={t('celebration.tasks')} value={String(steps)} />
              <StatTile label={t('celebration.checkins')} value={String(scoped.length)} valueTone="violet" />
            </View>
          </View>
          <Row style={styles.mt16}>
            <IconTile icon={hustle.icon} size={36} />
            <Text variant="body" weight="medium" style={styles.flex} numberOfLines={1}>
              {l(hustle.name)}
            </Text>
          </Row>
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('celebration.scaleTitle')}
          onPress={() => {
            haptics('medium');
            goTo('/coach');
          }}
          style={({ pressed }) => [styles.bigCta, { backgroundColor: colors.accent, boxShadow: `0 0 32px ${colors.accentGlow}` }, pressed && { opacity: 0.9 }]}>
          <View style={styles.flex}>
            <Text variant="h2" tone="onAccent">
              {t('celebration.scaleTitle')}
            </Text>
            <Text variant="bodySm" tone="onAccent" style={styles.dim}>
              {t('celebration.scaleBody')}
            </Text>
          </View>
          <View style={styles.arrowBox}>
            <ArrowRight size={22} color={colors.onAccent} strokeWidth={1.75} />
          </View>
        </Pressable>

        <Card onPress={() => goTo('/machine')} accessibilityLabel={t('celebration.spinTitle')}>
          <Row>
            <IconTile icon={Dices} tone="neutral" size={44} />
            <View style={styles.flex}>
              <Text variant="h3">{t('celebration.spinTitle')}</Text>
              <Text variant="bodySm" tone="secondary">
                {kind === 'roadmap' ? t('celebration.spinBodyFree') : t('celebration.spinBody')}
              </Text>
            </View>
          </Row>
        </Card>

        <Row style={styles.center} gap={space[4]}>
          <FooterLink
            icon={Share}
            label={t('celebration.share')}
            onPress={() =>
              router.push({
                pathname: '/share',
                params: kind === 'rank' ? { type: 'rank' } : { type: 'badge', badge: 'roadmap_complete' },
              })
            }
          />
          <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
          <FooterLink icon={ChartColumn} label={t('celebration.review')} onPress={() => goTo('/progress')} />
        </Row>
      </Screen>
      {/* "Reduce Motion" on: no floating particles. */}
      {reduceMotion ? null : <Particles />}
    </View>
  );
}

function FooterLink({ icon, label, onPress }: { icon: typeof Share; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Row gap={6}>
        <Icon icon={icon} size={16} />
        <Text variant="body" tone="secondary">
          {label}
        </Text>
      </Row>
    </Pressable>
  );
}

/** A few slow, drifting specks of light. Subtle on purpose. */
function Particles() {
  const { width, height } = useWindowDimensions();
  // Deterministic pseudo-random spread (keeps renders pure).
  const specks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const r = (seed: number) => ((i * 9301 + seed * 49297) % 233280) / 233280;
        return {
          x: r(1) * width,
          size: 2 + r(2) * 3,
          delay: r(3) * 3000,
          duration: 6000 + r(4) * 5000,
          amber: i % 5 === 0,
        };
      }),
    [width],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {specks.map((s, i) => (
        <Speck key={i} {...s} height={height} />
      ))}
    </View>
  );
}

function Speck({ x, size, delay, duration, amber, height }: { x: number; size: number; delay: number; duration: number; amber: boolean; height: number }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)));
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.1 ? progress.value * 6 : 0.6 * (1 - progress.value),
    transform: [{ translateY: height * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: amber ? colors.amber : colors.accent,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  header: {
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingBottom: space[2],
  },
  center: {
    alignSelf: 'center',
  },
  emblem: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[3],
  },
  grid: {
    gap: space[2],
    marginTop: space[4],
  },
  gridRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  mt16: {
    marginTop: space[4],
  },
  bigCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.xl,
    padding: space[5],
  },
  dim: {
    opacity: 0.75,
    marginTop: 2,
  },
  arrowBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,15,17,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsep: {
    width: 1,
    height: 16,
  },
});
