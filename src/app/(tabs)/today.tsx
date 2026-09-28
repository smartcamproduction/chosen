import { router } from 'expo-router';
import { Banknote, CalendarCheck, CircleCheck, Flame, Lock, LockOpen, Quote, SquareTerminal, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { MiniBars, ProgressRing } from '@/components/Charts';
import { Screen } from '@/components/Screen';
import { ErrorCard, LoadingCard } from '@/components/StateCards';
import { Button, Card, Checkbox, Chip, Icon, IconTile, ListRow, ProgressBar, Row, Text } from '@/components/ui';
import { GOAL_TARGET_USD } from '@/data/quiz';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { useL } from '@/lib/l10n';
import { openPaywall } from '@/lib/paywall';
import { levelKey, levelProgress, rankIndex, XP_PER_ACTIVE_DAY, XP_PER_CHECKIN } from '@/lib/progression';
import type { FlatStep } from '@/lib/roadmap';
import { isPremium } from '@/state/AppState';
import { useCheckin, useDuration, useMoney, useNow, useProgress, useQuiz, useRoadmap, useTier } from '@/state/hooks';
import { useProgressData } from '@/state/ProgressProvider';
import { openStep, useStepActions } from '@/state/useStepActions';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DAY_MS = 86_400_000;

export default function Today() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const now = useNow();
  const premium = isPremium(useTier());
  const quiz = useQuiz();
  const progress = useProgress();
  const money = useMoney();
  const { dailyMessages, todayLine, ready: progressReady, loadFailed, refresh } = useProgressData();
  const main = useRoadmap(1);
  const second = useRoadmap(2);
  const checkin = useCheckin(1);
  const { complete, busyId } = useStepActions();

  const { hustle, userHustle, dayNumber, isCommitted, locked, lockUntil, view, roadmap } = main;
  const lp = levelProgress(progress.xp);
  const rankNo = rankIndex(progress.rank) + 1;

  // Profit
  const month = money.thisMonth;
  const own = money.forHustle(userHustle?.id);
  const nets = own.checkins.map((c) => money.amounts(c).net);
  const lastDelta = nets.length >= 2 ? nets[nets.length - 1] - nets[nets.length - 2] : null;
  const goal = quiz ? money.fromUsd(GOAL_TARGET_USD[quiz.incomeGoal]) : null;

  // XP still available today
  const xpToday =
    (progress.activeToday ? 0 : XP_PER_ACTIVE_DAY) + (view?.current?.xp ?? 0) + (checkin?.kind === 'open' ? XP_PER_CHECKIN : 0);

  // Daily motivation (same message all day)
  const messages = dailyMessages[language];
  const dayIndex = Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / DAY_MS);
  // The line prepared by the daily-motivation function wins (personal for Pro/Elite).
  const message = todayLine?.text ?? (messages.length ? messages[dayIndex % messages.length] : '');
  const fromCoach = !!todayLine && (premium || todayLine.kind === 'nudge');

  return (
    <Screen bottomInset={false} gap={space[3]}>
      <Row style={styles.between} align="flex-end">
        <View style={styles.flex}>
          <Text variant="label" tone="secondary">
            {t('today.activeHustle')}
          </Text>
          <Text variant="h2" numberOfLines={2}>
            {l(hustle.name)}
          </Text>
        </View>
        <View style={[styles.dayPill, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <ProgressRing value={Math.min(1, dayNumber / 30)} />
          <Text variant="metricMd" weight="semibold">
            {dayNumber <= 30 ? t('common.dayShort', { day: dayNumber, total: 30 }) : t('today.dayOnly', { day: dayNumber })}
          </Text>
        </View>
      </Row>

      {!progressReady ? <LoadingCard /> : null}
      {loadFailed ? <ErrorCard onRetry={refresh} /> : null}

      <Card>
        <Row style={[styles.between, styles.wrap]} gap={space[2]}>
          <Chip label={`${t('progress.rankN', { n: rankNo })} · ${t(`ranks.${progress.rank}`)}`} dot tone="neutral" />
          <Chip
            label={progress.streak > 0 ? t('today.streak', { count: progress.streak }) : t('today.noStreak')}
            icon={Flame}
            tone={progress.streak > 0 ? 'amber' : 'neutral'}
            caps={false}
          />
        </Row>
        <Row style={[styles.between, styles.mt16]}>
          <Text variant="body" weight="semibold" style={styles.shrink}>
            {t('today.level', { level: lp.level, name: t(levelKey(lp.level)) })}
          </Text>
          <Text variant="metricMd">
            {t('today.xpProgress', { current: formatNumber(progress.xp, language), target: formatNumber(lp.nextXp, language) })}
          </Text>
        </Row>
        <ProgressBar value={lp.fraction} style={styles.mt8} />
        <Row style={[styles.between, styles.mt12]} align="flex-start">
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {t('today.nextLevel', { level: lp.nextLevel, name: t(levelKey(lp.nextLevel)) })}
          </Text>
          {xpToday > 0 ? (
            <Text variant="label" tone="accent" style={styles.shrink} align="right">
              {t('today.xpToday', { xp: xpToday })}
            </Text>
          ) : null}
        </Row>
      </Card>

      <Card>
        <Row style={[styles.between, styles.wrap]} gap={space[2]}>
          <Row gap={space[2]}>
            <Icon icon={Banknote} size={18} tone="accent" />
            <Text variant="label" tone="secondary">
              {t('today.profitTitle')}
            </Text>
          </Row>
          {lastDelta != null ? (
            <Chip
              label={t('today.vsLastWeek', { amount: money.format(lastDelta, { signed: true, decimals: 0 }) })}
              icon={lastDelta >= 0 ? TrendingUp : TrendingDown}
              tone={lastDelta >= 0 ? 'accent' : 'danger'}
              caps={false}
            />
          ) : null}
        </Row>
        <Row style={[styles.between, styles.mt16]} align="flex-end">
          <View style={styles.shrink}>
            <Text
              variant="metricXl"
              tone={month.net < 0 ? 'danger' : 'primary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={money.format(month.net).length > 9 ? styles.metricLong : undefined}>
              {money.format(month.net)}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {t('today.net')}
            </Text>
          </View>
          {nets.length >= 2 ? <MiniBars values={nets.slice(-6).map((n) => Math.max(0, n))} highlightFrom={Math.max(0, Math.min(6, nets.length) - 2)} /> : null}
        </Row>
        {goal ? (
          <>
            <Row style={[styles.between, styles.mt16]}>
              <Text variant="bodySm" tone="secondary">
                {t('today.target', { amount: money.format(goal, { decimals: 0 }) })}
              </Text>
              <Text variant="bodySm" weight="medium">
                {t('today.ofTarget', { percent: formatPercent(Math.max(0, month.net) / goal, language, 0) })}
              </Text>
            </Row>
            <ProgressBar value={Math.max(0, month.net) / goal} style={styles.mt8} />
          </>
        ) : null}
        {own.checkins.length === 0 ? (
          <Text variant="caption" tone="tertiary" style={styles.mt12}>
            {t('today.profitHint')}
          </Text>
        ) : null}
      </Card>

      {message ? (
        <Card variant="highlight">
          <Row gap={space[2]}>
            <Icon icon={Quote} size={18} tone="accent" />
            <Text variant="label" tone="accent">
              {todayLine?.kind === 'nudge' ? t('today.nudgeTitle') : t('today.motivationTitle')}
            </Text>
          </Row>
          <Text variant="bodyLg" style={styles.mt12}>
            “{message}”
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt12}>
            {fromCoach
              ? t('today.motivationFromCoach', { date: formatDate(new Date(now), language) })
              : t('today.motivationFooter', { date: formatDate(new Date(now), language) })}
          </Text>
        </Card>
      ) : null}

      <Row style={[styles.between, styles.mt8]}>
        <Text variant="h2">{t('today.tasksTitle')}</Text>
        {view ? <Chip label={t('today.tasksDone', { done: view.doneCount, total: view.total })} caps={false} /> : null}
      </Row>

      {view?.complete ? (
        <Card variant="accent">
          <Row>
            <IconTile icon={CircleCheck} size={44} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('today.roadmapDoneTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('today.roadmapDoneBody')}
              </Text>
            </View>
          </Row>
        </Card>
      ) : (
        view?.upNext.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            premium={premium}
            busy={busyId === step.id}
            onComplete={() => roadmap && complete(userHustle?.id, step.id, roadmap)}
          />
        ))
      )}

      <Card padding={space[4]} onPress={() => router.push('/check-in')} accessibilityLabel={t('today.checkinTitle')}>
        <Row>
          <IconTile icon={CalendarCheck} tone={checkin?.kind === 'open' ? 'accent' : 'violet'} />
          <View style={styles.flex}>
            <ListRow
              title={
                checkin?.kind === 'open'
                  ? t('today.checkinOpen', { n: checkin.week })
                  : checkin?.kind === 'done'
                    ? t('today.checkinDone', { n: checkin.week })
                    : t('today.checkinTitle')
              }
              sub={
                checkin?.kind === 'open'
                  ? t('today.checkinOpenSub', { xp: XP_PER_CHECKIN })
                  : checkin?.kind === 'done'
                    ? t('today.checkinNext', { date: formatDate(checkin.nextOpensAt, language) })
                    : checkin
                      ? t('today.checkinFirst', { date: formatDate(checkin.opensAt, language) })
                      : t('today.checkinSub')
              }
              chevron
            />
          </View>
          {checkin?.kind === 'open' ? <Chip label={t('today.due')} tone="solid" /> : null}
        </Row>
      </Card>

      {second.isCommitted ? (
        <Card
          padding={space[4]}
          style={{ borderColor: colors.violetBorder }}
          onPress={() => (second.view?.current ? openStep(second.view.current, 2) : undefined)}
          accessibilityLabel={l(second.hustle.name)}>
          <Row>
            <IconTile icon={second.hustle.icon} tone="violet" />
            <View style={styles.flex}>
              <Text variant="label" tone="violet">
                {t('today.secondHustle')}
              </Text>
              <Text variant="body" weight="semibold" numberOfLines={1}>
                {l(second.hustle.name)}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {second.view?.current ? t('today.secondNext', { title: second.view.current.title }) : t('common.dayOf', { day: second.sprintDay, total: 30 })}
              </Text>
            </View>
          </Row>
        </Card>
      ) : null}

      <Card padding={space[4]} onPress={() => router.push('/machine')} accessibilityLabel={t('today.machineTitle')}>
        <Row>
          <IconTile icon={isCommitted && !locked ? LockOpen : Lock} tone={isCommitted && !locked ? 'accent' : 'neutral'} />
          <View style={styles.flex}>
            <ListRow
              title={t('today.machineTitle')}
              sub={
                isCommitted && locked
                  ? t('today.machineSubLocked', { date: formatDate(lockUntil, language) })
                  : isCommitted
                    ? userHustle?.completed_at
                      ? t('today.machineSubDone')
                      : t('today.machineSubFree')
                    : t('today.machineSub')
              }
              chevron
            />
          </View>
        </Row>
      </Card>
    </Screen>
  );
}

function StepCard({ step, premium, busy, onComplete }: { step: FlatStep; premium: boolean; busy: boolean; onComplete: () => void }) {
  const { t } = useTranslation();
  const current = step.state === 'current';
  const duration = useDuration()(step.est_minutes);
  return (
    <Card variant={current ? 'elevated' : 'default'} padding={space[4]} style={!current && styles.dim}>
      <Row align="flex-start">
        {current ? (
          <Checkbox checked={busy} onChange={onComplete} accessibilityLabel={t('today.markDone', { title: step.title })} />
        ) : (
          <View style={styles.lockBox}>
            <Icon icon={Lock} size={16} tone="tertiary" />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step.title}
          onPress={() => openStep(step)}
          style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
          <Text variant="body" weight="semibold" numberOfLines={2}>
            {step.title}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt4} numberOfLines={1}>
            {current ? `${duration} · ${step.phase.title}` : t('today.unlocksAfter')}
          </Text>
        </Pressable>
        <Chip label={t('common.xp', { xp: step.xp })} tone={current ? 'solid' : 'neutral'} />
      </Row>
      {current ? (
        <Row style={styles.mt12}>
          <Button
            label={t('today.askCoach')}
            icon={premium ? SquareTerminal : Lock}
            variant="accentOutline"
            size="sm"
            fullWidth={false}
            style={styles.flex}
            onPress={() => (premium ? router.push('/coach') : openPaywall('today'))}
          />
          <Button label={t('today.open')} variant="secondary" size="sm" fullWidth={false} onPress={() => openStep(step)} />
        </Row>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  between: {
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  pressed: {
    opacity: 0.7,
  },
  dim: {
    opacity: 0.75,
  },
  metricLong: {
    fontSize: 27,
    lineHeight: 34,
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
  lockBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
