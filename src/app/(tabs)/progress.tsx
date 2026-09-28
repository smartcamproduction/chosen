import { router } from 'expo-router';
import { Check, Flame, Layers, Lock, Share, TrendingDown, TrendingUp, Trophy, Users, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ProfitLine, Sparkline, WeeklyBars } from '@/components/Charts';
import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { ErrorCard, LoadingCard } from '@/components/StateCards';
import { Card, Chip, IconButton, IconTile, ProgressBar, Row, StatTile, Text } from '@/components/ui';
import { BADGES } from '@/data/badges';
import { HOURS_MAX } from '@/data/quiz';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { useL } from '@/lib/l10n';
import { localDay, nextRank, rankIndex, RANKS, shiftDay } from '@/lib/progression';
import { useMoney, useNow, useProgress, useQuiz, useRoadmap } from '@/state/hooks';
import { useProgressData, type Percentile } from '@/state/ProgressProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const countryName = (code: string, language: string) => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export default function Progress() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const now = useNow();
  const quiz = useQuiz();
  const progress = useProgress();
  const money = useMoney();
  const { userBadges, activityDays, percentile, ready, loadFailed, refresh } = useProgressData();
  const { hustle, userHustle, dayNumber, startedAt, roadmap } = useRoadmap(1);
  const [top, setTop] = useState<{ userHustleId: string; value: Percentile | null } | null>(null);

  const userHustleId = userHustle?.id;
  const checkinCount = money.forHustle(userHustleId).checkins.length;
  useEffect(() => {
    if (!userHustleId) return;
    let cancelled = false;
    percentile(userHustleId).then((value) => {
      if (!cancelled) setTop({ userHustleId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userHustleId, checkinCount, percentile]);

  // Rank (all-time profit, all hustles)
  const rankNo = rankIndex(progress.rank);
  const next = nextRank(progress.rank);
  const nextTarget = next ? money.fromUsd(next.minUsd) : null;
  const floor = money.fromUsd(RANKS[rankNo].minUsd);

  // This hustle's weeks
  const own = money.forHustle(userHustleId);
  const weeks = own.checkins.map((c) => ({ week: c.week_number, ...money.amounts(c) }));
  const nets = weeks.map((w) => w.net);
  const cumulative = nets.reduce<number[]>((acc, n) => [...acc, (acc[acc.length - 1] ?? 0) + n], []);
  const lastDelta = nets.length >= 2 ? nets[nets.length - 1] - nets[nets.length - 2] : null;
  const shown = weeks.slice(-6);
  const totalColumns = Math.min(6, Math.max(4, shown.length + 1), roadmap ? roadmap.total_weeks : 12);
  const planHours = quiz ? HOURS_MAX[quiz.hours] * Math.max(1, own.checkins.length) : null;
  const hoursDiff = planHours != null ? own.hours - planHours : null;

  // Compared with your own previous weeks
  const lastNet = nets.length ? nets[nets.length - 1] : null;
  const earlier = nets.slice(0, -1);
  const average = earlier.length ? earlier.reduce((s, n) => s + n, 0) / earlier.length : null;
  const topValue = top && top.userHustleId === userHustleId ? top.value : null;
  const showTop = !!topValue && topValue.topPercent <= 50;

  // 30-day consistency grid (from the day the hustle was chosen)
  const active = new Set(activityDays);
  const firstDay = localDay(startedAt);
  const today = localDay(new Date(now));
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = shiftDay(firstDay, i);
    return { n: i + 1, active: active.has(day), today: day === today, future: day > today };
  });
  const activeCount = days.filter((d) => d.active).length;
  const elapsed = days.filter((d) => !d.future).length;

  const earned = new Map(userBadges.map((b) => [b.badge_id, b.earned_at]));

  if (!ready || loadFailed) {
    return (
      <Screen bottomInset={false} gap={space[3]}>
        <Text variant="h1">{t('progress.title')}</Text>
        {loadFailed ? <ErrorCard onRetry={refresh} /> : <LoadingCard />}
      </Screen>
    );
  }

  return (
    <Screen bottomInset={false} gap={space[3]}>
      <Row gap={space[2]} style={styles.wrap}>
        <Chip label={dayNumber <= 30 ? t('progress.sprintActive', { day: dayNumber }) : t('progress.dayN', { day: dayNumber })} dot tone="accent" />
        <Chip label={l(hustle.name)} icon={Layers} tone="violet" caps={false} />
      </Row>

      <View>
        <Text variant="h1">{t('progress.title')}</Text>
        <Text variant="body" tone="secondary">
          {t('progress.subtitle')}
        </Text>
      </View>

      <Card>
        <Row style={styles.between}>
          <Row gap={space[2]}>
            <Text variant="label" tone="accent">
              {t('progress.rankTitle')}
            </Text>
            <Chip label={t('progress.rankN', { n: rankNo + 1 })} tone="accent" />
          </Row>
        </Row>
        <Row style={[styles.between, styles.mt8]} align="flex-end">
          <Text variant="h2">{t(`ranks.${progress.rank}`)}</Text>
          {next && nextTarget != null ? (
            <Text variant="monoSm" tone="secondary" style={styles.shrink} align="right">
              {t('progress.toNext', {
                current: money.format(Math.max(0, money.allTime), { decimals: 0 }),
                target: money.format(nextTarget, { decimals: 0 }),
                rank: t(`ranks.${next.key}`),
              })}
            </Text>
          ) : (
            <Text variant="monoSm" tone="accent">
              {t('progress.topRank')}
            </Text>
          )}
        </Row>
        <ProgressBar value={next && nextTarget ? (money.allTime - floor) / Math.max(1, nextTarget - floor) : 1} style={styles.mt12} />

        <View style={styles.ladder}>
          <View style={[styles.ladderLine, { backgroundColor: colors.borderStrong }]} />
          <View style={[styles.ladderLine, styles.ladderFill, { backgroundColor: colors.accent, width: `${(rankNo / (RANKS.length - 1)) * 80}%` }]} />
          {RANKS.map((r, i) => {
            const done = i < rankNo;
            const current = i === rankNo;
            return (
              <View key={r.key} style={styles.ladderStep}>
                <View
                  style={[
                    styles.ladderNode,
                    done && { backgroundColor: colors.accent, borderColor: colors.accent },
                    current && { backgroundColor: colors.bg, borderColor: colors.accent, borderWidth: 2 },
                    !done && !current && { backgroundColor: colors.elevated, borderColor: colors.borderStrong },
                  ]}>
                  {done ? <Check size={16} color={colors.onAccent} strokeWidth={2.5} /> : null}
                  {current ? <View style={[styles.ladderDot, { backgroundColor: colors.accent }]} /> : null}
                  {!done && !current ? <Lock size={13} color={colors.textTertiary} strokeWidth={1.75} /> : null}
                </View>
                <Text variant="caption" tone={current ? 'accent' : done ? 'primary' : 'tertiary'} weight={current ? 'semibold' : 'regular'} numberOfLines={1}>
                  {t(`ranks.${r.key}`)}
                </Text>
                <Text variant="monoSm" tone="tertiary" numberOfLines={1} style={styles.ladderAmount}>
                  {money.format(money.fromUsd(r.minUsd), { decimals: 0 })}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.streakRow, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <IconTile icon={Flame} tone="amber" size={36} />
          <View style={styles.flex}>
            <Row gap={space[2]} style={styles.wrap}>
              <Text variant="body" weight="semibold">
                {t('progress.streakValue', { count: progress.streak })}
              </Text>
              <Chip label={t('progress.best', { count: progress.bestStreak })} tone="accent" caps={false} />
            </Row>
            <Text variant="caption" tone="secondary">
              {t('progress.rankHint')}
            </Text>
          </View>
          {cumulative.length >= 2 ? <Sparkline values={cumulative} /> : null}
        </View>
      </Card>

      <Card variant={showTop ? 'accent' : 'default'}>
        {showTop && topValue ? (
          <Row>
            <IconTile icon={Trophy} tone="amber" size={44} />
            <View style={styles.flex}>
              <Text variant="label" tone="secondary">
                {t('progress.compareTitle')}
              </Text>
              <Text variant="h3">{t('progress.topPercent', { percent: topValue.topPercent, country: countryName(topValue.country, language) })}</Text>
              <Text variant="caption" tone="secondary">
                {t('progress.topPercentNote')}
              </Text>
            </View>
          </Row>
        ) : (
          <Row align="flex-start">
            <IconTile icon={Users} tone="violet" size={44} />
            <View style={styles.flex}>
              <Text variant="label" tone="secondary">
                {t('progress.selfTitle')}
              </Text>
              {lastNet == null ? (
                <Text variant="body">{t('progress.selfNone')}</Text>
              ) : average == null ? (
                <Text variant="body">{t('progress.selfFirst', { amount: money.format(lastNet, { decimals: 0 }) })}</Text>
              ) : (
                <>
                  <Row gap={space[2]} style={styles.wrap}>
                    <Text variant="metricLg" tone={lastNet >= average ? 'accent' : 'danger'}>
                      {money.format(lastNet - average, { decimals: 0, signed: true })}
                    </Text>
                    {average > 0 ? (
                      <Chip
                        label={formatPercent((lastNet - average) / average, language, 0)}
                        icon={lastNet >= average ? TrendingUp : TrendingDown}
                        tone={lastNet >= average ? 'accent' : 'danger'}
                        caps={false}
                      />
                    ) : null}
                  </Row>
                  <Text variant="bodySm" tone="secondary">
                    {t('progress.selfCompare', { last: money.format(lastNet, { decimals: 0 }), average: money.format(average, { decimals: 0 }), count: earlier.length })}
                  </Text>
                </>
              )}
              <Text variant="caption" tone="tertiary" style={styles.mt4}>
                {t('progress.selfNote')}
              </Text>
            </View>
          </Row>
        )}
      </Card>

      <Card>
        <Row style={styles.between}>
          <Text variant="label" tone="secondary">
            {t('progress.netProfit')}
          </Text>
          <IconButton icon={Share} size={36} accessibilityLabel={t('share.title')} onPress={() => router.push({ pathname: '/share', params: { type: 'earnings' } })} />
        </Row>
        <Row gap={space[3]} style={[styles.wrap, styles.mt8]} align="center">
          <Text variant="metricXl" tone={own.net < 0 ? 'danger' : 'primary'}>
            {money.format(own.net)}
          </Text>
          {lastDelta != null ? (
            <Chip
              label={t('progress.vsLastWeek', { amount: money.format(lastDelta, { signed: true, decimals: 0 }) })}
              icon={lastDelta >= 0 ? TrendingUp : TrendingDown}
              tone={lastDelta >= 0 ? 'accent' : 'danger'}
              caps={false}
            />
          ) : null}
        </Row>
        {cumulative.length ? (
          <View style={styles.mt12}>
            <ProfitLine values={cumulative} />
          </View>
        ) : (
          <Text variant="bodySm" tone="secondary" style={styles.mt8}>
            {t('progress.noData')}
          </Text>
        )}
        <Row style={[styles.between, styles.mt12, styles.wrap]} gap={space[2]}>
          <Row gap={space[3]} style={styles.wrap}>
            <Legend color={colors.accent} label={`${t('progress.revenue')}: ${money.format(own.revenue, { decimals: 0 })}`} />
            <Legend color={colors.chartCost} label={`${t('progress.costs')}: ${money.format(own.costs, { decimals: 0 })}`} />
          </Row>
          <Text variant="label" tone="tertiary">
            {t('progress.weekly')}
          </Text>
        </Row>
        <View style={styles.mt16}>
          <WeeklyBars weeks={shown} total={totalColumns} weekLabel={(n) => t('progress.week', { n })} />
        </View>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <StatTile label={t('progress.grossRevenue')} value={money.format(own.revenue, { decimals: 0 })} sub={t('progress.checkins', { count: own.checkins.length })} />
            <StatTile label={t('progress.operatingCosts')} value={money.format(own.costs, { decimals: 0 })} sub={t('progress.costsSub')} />
          </View>
          <View style={styles.gridRow}>
            <StatTile
              label={t('progress.hoursInvested')}
              value={formatNumber(own.hours, language, 1)}
              unit={t('common.hrs')}
              sub={
                planHours != null && hoursDiff != null
                  ? t('progress.hoursPlan', { plan: formatNumber(planHours, language, 0), diff: `${hoursDiff >= 0 ? '+' : '−'}${formatNumber(Math.abs(hoursDiff), language, 1)}` })
                  : undefined
              }
              subTone={hoursDiff != null && hoursDiff >= 0 ? 'accent' : 'amber'}
            />
            <StatTile
              label={t('progress.effectiveRate')}
              value={own.hours > 0 ? money.format(own.net / own.hours) : '—'}
              unit={own.hours > 0 ? t('progress.perHour') : undefined}
              valueTone="accent"
              sub={t('progress.rateSub')}
            />
          </View>
        </View>
      </Card>

      <Card>
        <Row style={styles.between} align="flex-start">
          <View style={styles.flex}>
            <Text variant="label" tone="secondary">
              {t('progress.matrixKicker')}
            </Text>
            <Text variant="h3">{t('progress.matrixTitle')}</Text>
          </View>
          <Chip label={t('progress.activeDays', { active: activeCount, total: elapsed })} icon={Zap} tone="accent" caps={false} />
        </Row>
        <View style={styles.matrix}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.matrixRow}>
              {days.slice(row * 10, row * 10 + 10).map((d) => (
                <View
                  key={d.n}
                  accessibilityLabel={`${d.n}: ${d.active ? t('progress.completedLegend') : ''}`}
                  style={[
                    styles.cell,
                    d.active && { backgroundColor: colors.accent },
                    d.today && { borderWidth: 2, borderColor: colors.accent },
                    !d.active && { backgroundColor: d.today ? colors.accentSoft : colors.elevated },
                  ]}>
                  <Text variant="monoSm" tone={d.active ? 'onAccent' : d.today ? 'accent' : 'tertiary'} style={styles.cellText}>
                    {d.n}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <Row style={[styles.between, styles.mt12, styles.wrap]} gap={space[2]}>
          <Legend color={colors.accent} label={`${activeCount} ${t('progress.completedLegend')}`} />
          <Legend color={colors.accentSoft} outline={colors.accent} label={t('progress.todayLegend')} />
          <Legend color={colors.elevated} label={`${Math.max(0, 30 - elapsed)} ${t('progress.remainingLegend')}`} />
        </Row>
      </Card>

      <Row style={[styles.between, styles.mt8]} align="flex-end">
        <View style={styles.flex}>
          <Text variant="h2">{t('progress.badgesTitle')}</Text>
          <Text variant="bodySm" tone="secondary">
            {t('progress.badgesSub')}
          </Text>
        </View>
        <Chip label={t('progress.unlockedCount', { count: BADGES.filter((b) => earned.has(b.id)).length, total: BADGES.length })} tone="accent" caps={false} size="md" />
      </Row>

      <View style={styles.badgeGrid}>
        {BADGES.map((b) => {
          const at = earned.get(b.id);
          return (
            <Card key={b.id} padding={space[3]} radius={radius.lg} style={[styles.badge, !at && styles.lockedBadge]}>
              <IconTile icon={at ? b.icon : Lock} tone={at ? b.tone : 'neutral'} size={40} />
              <Text variant="body" weight="semibold" tone={at ? 'primary' : 'secondary'} numberOfLines={1} style={styles.mt8}>
                {t(`badges.${b.id}.title`)}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={2}>
                {t(`badges.${b.id}.body`)}
              </Text>
              <Text variant="caption" tone={at ? 'accent' : 'tertiary'} style={styles.mt4}>
                {at ? t('progress.earnedOn', { date: formatDate(new Date(at), language) }) : t('progress.lockedBadge')}
              </Text>
            </Card>
          );
        })}
      </View>

      <Disclaimer style={styles.mt8} />
    </Screen>
  );
}

function Legend({ color, label, outline }: { color: string; label: string; outline?: string }) {
  return (
    <Row gap={6}>
      <View style={[styles.legendSwatch, { backgroundColor: color }, outline ? { borderWidth: 1.5, borderColor: outline } : null]} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexWrap: 'wrap',
  },
  between: {
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  mt4: {
    marginTop: 4,
  },
  mt8: {
    marginTop: space[2],
  },
  mt12: {
    marginTop: space[3],
  },
  mt16: {
    marginTop: space[4],
  },
  ladder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[5],
  },
  ladderLine: {
    position: 'absolute',
    top: 15,
    left: '10%',
    right: '10%',
    height: 2,
  },
  ladderFill: {
    right: undefined,
  },
  ladderStep: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  ladderNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  ladderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ladderAmount: {
    fontSize: 10,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    marginTop: space[5],
  },
  grid: {
    gap: space[2],
    marginTop: space[4],
  },
  gridRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  matrix: {
    gap: 6,
    marginTop: space[4],
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 11,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  badge: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  lockedBadge: {
    opacity: 0.6,
  },
});
