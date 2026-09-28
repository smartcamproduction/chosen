import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Anchor,
  ArrowRight,
  BatteryLow,
  CalendarClock,
  CircleCheck,
  Clock,
  Cog,
  Flame,
  ImagePlus,
  Lightbulb,
  ListChecks,
  Lock,
  Rocket,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Card, Chip, EmptyState, Icon, IconButton, IconTile, ProgressBar, Row, SectionHeader, StatTile, Text } from '@/components/ui';
import { humanizeMetric, isMetricKey } from '@/data/metrics';
import { HOURS_MAX } from '@/data/quiz';
import { useLanguage } from '@/i18n/LanguageProvider';
import { MAX_SCREENSHOTS, pickScreenshots, type PickedImage } from '@/lib/checkin';
import { currencySymbol, formatDate, formatNumber, formatPercent, pad2, parseAmount } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { openPaywall } from '@/lib/paywall';
import { XP_PER_CHECKIN, type RewardResult } from '@/lib/progression';
import { askForReviewAfter } from '@/lib/review';
import { isPremium } from '@/state/AppState';
import { useCheckin, useMoney, useNow, useQuiz, useRoadmap, useTier } from '@/state/hooks';
import { useProgressData } from '@/state/ProgressProvider';
import { useAccount } from '@/state/AccountProvider';
import { useRewards } from '@/state/RewardsProvider';
import { requestCheckinFeedback } from '@/state/useCoach';
import { useProgressErrorText } from '@/state/useStepActions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

type Mood = 'drained' | 'grinding' | 'steady' | 'momentum' | 'unstoppable';
const MOODS: { key: Mood; icon: LucideIcon }[] = [
  { key: 'drained', icon: BatteryLow },
  { key: 'grinding', icon: Cog },
  { key: 'steady', icon: Anchor },
  { key: 'momentum', icon: Rocket },
  { key: 'unstoppable', icon: Zap },
];
const DAY_MS = 86_400_000;

export default function CheckIn() {
  const { t } = useTranslation();
  const l = useL();
  const { language } = useLanguage();
  const premium = isPremium(useTier());
  const { hustle, userHustle, roadmap } = useRoadmap(1);
  const state = useCheckin(1);
  const { checkins } = useProgressData();
  const money = useMoney();
  const now = useNow();
  const [result, setResult] = useState<{ reward: RewardResult; steps: string[] } | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/today'));

  // After the result: the first check-in of a Free user opens the paywall;
  // the first logged revenue asks for an App Store rating (a rank-up asks
  // on its own celebration screen instead).
  const finish = (reward: RewardResult) => {
    close();
    if (!premium && reward.newBadges.includes('first_checkin')) {
      setTimeout(() => openPaywall('first_checkin'), 400);
      return;
    }
    if (reward.newBadges.includes('first_sale') && reward.rankAfter === reward.rankBefore) askForReviewAfter('first_earnings', 1200);
  };

  if (result) {
    return (
      <CheckinResult
        reward={result.reward}
        stepTitles={result.steps}
        premium={premium}
        onDone={() => finish(result.reward)}
        onUpgrade={() => {
          close();
          openPaywall('first_checkin');
        }}
      />
    );
  }

  if (!userHustle || !state) {
    return (
      <Screen header={<StepHeader title={t('checkin.title')} />}>
        <EmptyState icon={CalendarClock} title={t('checkin.noHustleTitle')} body={t('checkin.noHustleBody')} action={{ label: t('common.back'), onPress: close }} />
      </Screen>
    );
  }

  if (state.kind !== 'open') {
    const last = checkins.filter((c) => c.user_hustle_id === userHustle.id).sort((a, b) => b.week_number - a.week_number)[0];
    const lastAmounts = last ? money.amounts(last) : null;
    return (
      <Screen header={<StepHeader title={t('checkin.title')} />} gap={space[3]}>
        <Card>
          <Row align="flex-start">
            <IconTile icon={state.kind === 'done' ? CircleCheck : Lock} tone={state.kind === 'done' ? 'accent' : 'neutral'} size={44} />
            <View style={styles.flex}>
              <Text variant="h3">
                {state.kind === 'done' ? t('checkin.doneTitle', { n: state.week }) : t('checkin.waitingTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary" style={styles.mt4}>
                {state.kind === 'done'
                  ? t('checkin.doneBody', { date: formatDate(state.nextOpensAt, language) })
                  : t('checkin.waitingBody', { date: formatDate(state.opensAt, language), day: 7 * state.week })}
              </Text>
            </View>
          </Row>
        </Card>
        {state.kind === 'done' && last && lastAmounts ? (
          <Row gap={space[2]} align="stretch">
            <StatTile label={t('checkin.revenue')} value={money.format(lastAmounts.revenue, { decimals: 0 })} />
            <StatTile label={t('checkin.costs')} value={money.format(lastAmounts.costs, { decimals: 0 })} />
            <StatTile label={t('checkin.net')} value={money.format(lastAmounts.net, { decimals: 0 })} valueTone={lastAmounts.net >= 0 ? 'accent' : 'danger'} />
          </Row>
        ) : null}
        <Text variant="caption" tone="tertiary" align="center">
          {t('checkin.everyWeek')}
        </Text>
        <Button label={t('common.back')} variant="secondary" onPress={close} />
      </Screen>
    );
  }

  const previous = checkins
    .filter((c) => c.user_hustle_id === userHustle.id && c.week_number < state.week)
    .sort((a, b) => b.week_number - a.week_number)[0];
  const sinceIso = previous?.created_at ?? userHustle.started_at;
  const daysLeft = Math.max(0, Math.ceil((state.closesAt.getTime() - now) / DAY_MS));

  return (
    <CheckinForm
      key={`${userHustle.id}-${state.week}`}
      week={state.week}
      daysLeft={daysLeft}
      dayOfHustle={state.week * 7}
      hustleName={l(hustle.name)}
      userHustleId={userHustle.id}
      metricsKeys={roadmap?.weekly_metrics ?? []}
      previousId={previous?.id ?? null}
      sinceIso={sinceIso}
      premium={premium}
      onSubmitted={(reward, titles) => setResult({ reward, steps: titles })}
    />
  );
}

interface FormProps {
  week: number;
  daysLeft: number;
  dayOfHustle: number;
  hustleName: string;
  userHustleId: string;
  metricsKeys: string[];
  previousId: string | null;
  sinceIso: string;
  premium: boolean;
  onSubmitted: (reward: RewardResult, stepTitles: string[]) => void;
}

function CheckinForm({ week, daysLeft, dayOfHustle, hustleName, userHustleId, metricsKeys, previousId, sinceIso, premium, onSubmitted }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const haptics = useHaptics();
  const quiz = useQuiz();
  const money = useMoney();
  const { checkins, stepProgress, submitCheckin } = useProgressData();
  const { view } = useRoadmap(1);
  const { celebrate } = useRewards();
  const account = useAccount();
  const errorText = useProgressErrorText();

  const [mood, setMood] = useState<Mood | null>(null);
  const [revenue, setRevenue] = useState('');
  const [costs, setCosts] = useState('');
  const [hours, setHours] = useState('');
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [blocker, setBlocker] = useState('');
  const [shots, setShots] = useState<PickedImage[]>([]);
  const [goals, setGoals] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);

  const previous = checkins.find((c) => c.id === previousId) ?? null;
  const prevAmounts = previous ? money.amounts(previous) : null;
  const prevMetrics = (previous?.metrics && typeof previous.metrics === 'object' && !Array.isArray(previous.metrics) ? previous.metrics : {}) as Record<string, unknown>;

  const rev = parseAmount(revenue);
  const cost = parseAmount(costs);
  const hrs = hours.trim() ? parseAmount(hours) : null;
  const valid = rev != null && cost != null && (hours.trim() === '' || (hrs != null && hrs <= 168));
  const net = (rev ?? 0) - (cost ?? 0);
  const margin = rev && rev > 0 ? net / rev : null;
  const planHours = quiz ? HOURS_MAX[quiz.hours] : null;
  const pacing = planHours && hrs != null ? hrs / planHours : null;
  const revDelta = prevAmounts && rev != null ? rev - prevAmounts.revenue : null;

  // Steps finished since the last check-in (the server attaches the same list).
  const attached = stepProgress
    .filter((s) => s.user_hustle_id === userHustleId && s.completed_at >= sinceIso)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
    .map((s) => view?.byId(s.step_id)?.title ?? s.step_id);

  const goalsSet = goals.filter((g) => g.trim()).length;
  const symbol = currencySymbol(money.currency);

  const addShots = async () => {
    try {
      const picked = await pickScreenshots(MAX_SCREENSHOTS - shots.length);
      if (picked.length) setShots((prev) => [...prev, ...picked].slice(0, MAX_SCREENSHOTS));
    } catch {
      Alert.alert(t('checkin.pickFailed'));
    }
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const metricValues: Record<string, number> = {};
    for (const key of metricsKeys) {
      const v = parseAmount(metrics[key] ?? '');
      if (v != null && (metrics[key] ?? '').trim()) metricValues[key] = v;
    }
    const outcome = await submitCheckin({
      userHustleId,
      feeling: mood ? MOODS.findIndex((m) => m.key === mood) + 1 : null,
      revenue: rev ?? 0,
      costs: cost ?? 0,
      currency: money.currency,
      hours: hrs,
      metrics: metricValues,
      motivation: energy,
      blockers: blocker,
      nextWeekPlan: goals.map((g) => g.trim()).filter(Boolean).join('\n'),
      screenshots: shots,
    });
    setBusy(false);
    if (!outcome.ok) {
      haptics('error');
      Alert.alert(errorText(outcome.error));
      return;
    }
    celebrate(outcome.reward);
    // Pro / Elite: the coach analyses the check-in (shows up in the Coach tab).
    const serverTier = account.profile?.tier;
    if (outcome.reward.checkinId && account.mode === 'supabase' && (serverTier === 'pro' || serverTier === 'elite') && account.profile?.ai_consent_at) {
      requestCheckinFeedback(outcome.reward.checkinId).catch(() => {});
    }
    onSubmitted(outcome.reward, attached);
  };

  const inputStyle = [styles.moneyInput, { color: colors.text }];

  return (
    <Screen
      header={
        <StepHeader
          title={t('checkin.week', { n: pad2(week) })}
          right={<Chip label={daysLeft <= 1 ? t('checkin.closesToday') : t('checkin.closesIn', { count: daysLeft })} icon={Clock} tone="amber" caps={false} size="md" />}
        />
      }
      gap={space[3]}
      footer={
        <>
          <Button
            label={busy ? (shots.length ? t('checkin.uploading') : t('checkin.saving')) : premium ? t('checkin.submitPro') : t('checkin.submit')}
            iconRight={busy ? undefined : ArrowRight}
            onPress={submit}
            loading={busy}
            disabled={!valid}
            haptic={null}
          />
          <Row gap={6} style={styles.center}>
            <Icon icon={Zap} size={14} tone="accent" />
            <Text variant="caption" weight="semibold" tone="accent">
              {t('checkin.reward', { xp: XP_PER_CHECKIN })}
            </Text>
          </Row>
        </>
      }>
      <View>
        <Text variant="h1">{t('checkin.title')}</Text>
        <Text variant="bodySm" tone="secondary">
          {t('checkin.subtitle', { day: dayOfHustle })} | {hustleName}
        </Text>
      </View>

      <Card padding={space[4]}>
        <Row align="flex-start">
          <IconTile icon={Flame} tone="amber" size={36} />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {t('checkin.introTitle')}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {t('checkin.introBody')}
            </Text>
          </View>
        </Row>
      </Card>

      {/* 01 Mood */}
      <SectionHeader
        label={`01 // ${t('checkin.q1')}`}
        right={mood ? t('checkin.selected', { mood: t(`checkin.moods.${mood}`) }) : t('common.optional')}
        rightTone={mood ? 'accent' : 'tertiary'}
        style={styles.section}
      />
      <Row gap={space[2]}>
        {MOODS.map((m) => {
          const selected = mood === m.key;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={t(`checkin.moods.${m.key}`)}
              onPress={() => {
                haptics('selection');
                setMood(selected ? null : m.key);
              }}
              style={[styles.mood, { backgroundColor: selected ? colors.elevated : colors.surface, borderColor: selected ? colors.accentBorder : colors.border }]}>
              <Icon icon={m.icon} size={22} tone={selected ? 'accent' : 'secondary'} />
              <Text variant="caption" tone={selected ? 'primary' : 'secondary'} weight={selected ? 'semibold' : 'regular'} align="center" numberOfLines={2} style={styles.moodLabel}>
                {t(`checkin.moods.${m.key}`)}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {/* 02 Money & time */}
      <SectionHeader label={`02 // ${t('checkin.q2')}`} right={t('checkin.autoCalc')} style={styles.section} />
      <Card padding={space[4]}>
        <Row align="stretch">
          <View style={[styles.inputTile, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
            <Text variant="label" tone="secondary">
              {t('checkin.revenue')}
            </Text>
            <Row gap={4}>
              <Text variant="metricMd" tone="secondary">
                {symbol}
              </Text>
              <TextInput
                value={revenue}
                onChangeText={setRevenue}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                style={inputStyle}
                accessibilityLabel={t('checkin.revenue')}
              />
            </Row>
            {revDelta != null ? (
              <Row gap={4}>
                <Icon icon={revDelta >= 0 ? TrendingUp : TrendingDown} size={12} tone={revDelta >= 0 ? 'accent' : 'danger'} />
                <Text variant="caption" tone={revDelta >= 0 ? 'accent' : 'danger'}>
                  {t('checkin.vsLast', { amount: money.format(revDelta, { signed: true, decimals: 0 }) })}
                </Text>
              </Row>
            ) : (
              <Text variant="caption" tone="secondary">
                {t('checkin.revenueHint')}
              </Text>
            )}
          </View>
          <View style={[styles.inputTile, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
            <Text variant="label" tone="secondary">
              {t('checkin.costs')}
            </Text>
            <Row gap={4}>
              <Text variant="metricMd" tone="secondary">
                {symbol}
              </Text>
              <TextInput
                value={costs}
                onChangeText={setCosts}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                style={inputStyle}
                accessibilityLabel={t('checkin.costs')}
              />
            </Row>
            <Text variant="caption" tone="secondary">
              {t('checkin.costsHint')}
            </Text>
          </View>
        </Row>
        {rev == null || cost == null ? (
          <Text variant="caption" tone="danger" style={styles.mt8}>
            {t('checkin.amountInvalid')}
          </Text>
        ) : null}

        <View style={[styles.netBox, { backgroundColor: colors.elevated, borderColor: colors.accentBorder }]}>
          <Text variant="label" tone="secondary">
            {t('checkin.net')}
          </Text>
          <Row style={styles.between}>
            <Text variant="metricXl" tone={net >= 0 ? 'accent' : 'danger'} numberOfLines={1} adjustsFontSizeToFit style={styles.shrink}>
              {money.format(net)}
            </Text>
            {margin != null ? (
              <Chip label={t('checkin.margin', { percent: formatPercent(margin, language, 0) })} icon={margin >= 0 ? TrendingUp : TrendingDown} tone={margin >= 0 ? 'accent' : 'danger'} caps={false} />
            ) : null}
          </Row>
        </View>

        <View style={[styles.hoursBox, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
          <Text variant="label" tone="secondary">
            {t('checkin.hours')}
          </Text>
          <Row gap={4} align="baseline" style={styles.mt8}>
            <TextInput
              value={hours}
              onChangeText={setHours}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              style={[styles.hoursInput, { color: colors.text }]}
              accessibilityLabel={t('checkin.hours')}
            />
            <Text variant="bodySm" tone="secondary">
              {planHours ? t('checkin.hoursTarget', { target: planHours }) : t('common.hours')}
            </Text>
          </Row>
          {pacing != null ? (
            <>
              <ProgressBar value={pacing} style={styles.mt8} tone={pacing >= 0.9 ? 'accent' : 'amber'} />
              <Row style={[styles.between, styles.mt8]}>
                <Text variant="caption" tone="secondary">
                  {t('checkin.pacing', { percent: formatPercent(pacing, language) })}
                </Text>
                <Text variant="caption" weight="semibold" tone={pacing >= 0.9 ? 'accent' : 'amber'}>
                  {pacing >= 0.9 ? t('checkin.onSchedule') : t('checkin.behind')}
                </Text>
              </Row>
            </>
          ) : null}
        </View>
      </Card>

      {/* 03 Weekly metrics from the roadmap */}
      {metricsKeys.length ? (
        <>
          <SectionHeader label={`03 // ${t('checkin.q3')}`} right={t('checkin.q3Right')} style={styles.section} />
          <View style={styles.metricGrid}>
            {metricsKeys.map((key) => {
              const prev = prevMetrics[key];
              return (
                <View key={key} style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text variant="label" tone="secondary" numberOfLines={2}>
                    {isMetricKey(key) ? t(`metrics.${key}`) : humanizeMetric(key)}
                  </Text>
                  <TextInput
                    value={metrics[key] ?? ''}
                    onChangeText={(v) => setMetrics((prevState) => ({ ...prevState, [key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    style={[styles.metricInput, { color: colors.text }]}
                    accessibilityLabel={isMetricKey(key) ? t(`metrics.${key}`) : humanizeMetric(key)}
                  />
                  <Text variant="caption" tone="tertiary">
                    {typeof prev === 'number' ? t('checkin.lastWeek', { value: formatNumber(prev, language) }) : t('common.optional')}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {/* 04 Energy */}
      <SectionHeader label={`04 // ${t('checkin.q4')}`} right={energy ? `${energy} / 10` : t('common.optional')} rightTone={energy ? 'accent' : 'tertiary'} style={styles.section} />
      <Card padding={space[4]}>
        <Row gap={4}>
          {Array.from({ length: 10 }, (_, i) => {
            const v = i + 1;
            const on = energy != null && v <= energy;
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityLabel={`${v} / 10`}
                accessibilityState={{ selected: v === energy }}
                onPress={() => {
                  haptics('selection');
                  setEnergy(v);
                }}
                style={[styles.energy, { backgroundColor: on ? colors.accent : colors.chartMuted, opacity: on ? 0.45 + v * 0.055 : 1 }]}
              />
            );
          })}
        </Row>
        <Row style={[styles.between, styles.mt8]}>
          <Text variant="caption" tone="tertiary">
            {t('checkin.energyLow')}
          </Text>
          <Text variant="caption" tone="tertiary">
            {t('checkin.energyMid')}
          </Text>
          <Text variant="caption" tone="tertiary">
            {t('checkin.energyHigh')}
          </Text>
        </Row>
      </Card>

      {/* 05 Blockers */}
      <SectionHeader label={`05 // ${t('checkin.q5')}`} style={styles.section} />
      <Card padding={space[4]}>
        <TextInput
          value={blocker}
          onChangeText={setBlocker}
          multiline
          maxLength={4000}
          placeholder={t('checkin.q5Placeholder')}
          placeholderTextColor={colors.textTertiary}
          style={[styles.textArea, { backgroundColor: colors.recessed, borderColor: colors.border, color: colors.text }]}
          accessibilityLabel={t('checkin.q5')}
        />
        <Row gap={6} style={styles.mt12} align="flex-start">
          <Icon icon={Lightbulb} size={14} tone="amber" />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {premium ? t('checkin.blockerHintPro') : t('checkin.blockerHintFree')}
          </Text>
        </Row>
      </Card>

      {/* 06 Proof */}
      <SectionHeader label={`06 // ${t('checkin.q6')}`} right={t('checkin.shotCount', { count: shots.length, max: MAX_SCREENSHOTS })} style={styles.section} />
      <Card padding={space[4]}>
        {shots.length ? (
          <View style={styles.shots}>
            {shots.map((s, i) => (
              <View key={`${s.uri}-${i}`} style={[styles.shot, { borderColor: colors.border }]}>
                <Image source={{ uri: s.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                <IconButton
                  icon={X}
                  size={28}
                  accessibilityLabel={t('checkin.removeShot')}
                  onPress={() => setShots((prev) => prev.filter((_, j) => j !== i))}
                  style={styles.removeShot}
                />
              </View>
            ))}
          </View>
        ) : null}
        <Button
          label={t('checkin.upload')}
          icon={ImagePlus}
          variant="secondary"
          size="md"
          onPress={addShots}
          disabled={shots.length >= MAX_SCREENSHOTS}
          style={shots.length ? styles.mt12 : undefined}
        />
        <Text variant="caption" tone="tertiary" style={styles.mt8}>
          {t('checkin.shotsPrivate')}
        </Text>
      </Card>

      {/* 07 Next week */}
      <SectionHeader label={`07 // ${t('checkin.q7')}`} right={t('checkin.setCount', { done: goalsSet, total: 3 })} rightTone="accent" style={styles.section} />
      <Card padding={space[3]}>
        {goals.map((g, i) => (
          <Row key={i} style={[styles.goal, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
            <Text variant="monoSm" tone={g.trim() ? 'accent' : 'tertiary'}>
              {pad2(i + 1)}
            </Text>
            <TextInput
              value={g}
              onChangeText={(v) => setGoals((prev) => prev.map((x, j) => (j === i ? v : x)))}
              maxLength={200}
              placeholder={t('checkin.goalPlaceholder', { n: i + 1 })}
              placeholderTextColor={colors.textTertiary}
              style={[styles.goalInput, { color: colors.text }]}
              accessibilityLabel={t('checkin.goalPlaceholder', { n: i + 1 })}
            />
          </Row>
        ))}
      </Card>

      {/* 08 Steps finished this week (attached automatically) */}
      <SectionHeader label={`08 // ${t('checkin.q8')}`} right={t('checkin.autoAttached')} style={styles.section} />
      <Card padding={space[4]}>
        {attached.length ? (
          attached.map((title, i) => (
            <Row key={i} gap={space[2]} style={i > 0 ? styles.mt8 : undefined} align="flex-start">
              <Icon icon={CircleCheck} size={16} tone="accent" />
              <Text variant="bodySm" style={styles.flex}>
                {title}
              </Text>
            </Row>
          ))
        ) : (
          <Row gap={space[2]}>
            <Icon icon={ListChecks} size={16} tone="tertiary" />
            <Text variant="bodySm" tone="secondary" style={styles.flex}>
              {t('checkin.noSteps')}
            </Text>
          </Row>
        )}
      </Card>

      <Text variant="caption" tone="tertiary" align="center" style={styles.mt8}>
        {t('checkin.footer')}
      </Text>
    </Screen>
  );
}

function CheckinResult({
  reward,
  stepTitles,
  premium,
  onDone,
  onUpgrade,
}: {
  reward: RewardResult;
  stepTitles: string[];
  premium: boolean;
  onDone: () => void;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen header={<StepHeader title={t('checkin.title')} />} gap={space[4]} footer={<Button label={t('common.done')} onPress={onDone} />}>
      <View style={styles.resultTop}>
        <View style={[styles.resultIcon, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
          <CircleCheck size={40} color={colors.accentText} strokeWidth={1.5} />
        </View>
        <Text variant="h1" align="center">
          {t('checkin.resultTitle', { n: reward.week ?? 1 })}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {t('checkin.resultBody', { count: stepTitles.length })}
        </Text>
      </View>

      <Row gap={space[2]} align="stretch">
        <StatTile label={t('checkin.resultXp')} value={`+${reward.xpGained}`} valueTone="accent" icon={Zap} />
        <StatTile label={t('checkin.resultStreak')} value={String(reward.streak)} icon={Flame} valueTone="amber" />
      </Row>

      {premium ? (
        <Card variant="elevated" padding={space[4]}>
          <Row>
            <IconTile icon={Sparkles} tone="violet" size={40} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('checkin.proTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('checkin.proBody')}
              </Text>
            </View>
          </Row>
          <Button
            label={t('checkin.openCoach')}
            iconRight={ArrowRight}
            variant="secondary"
            size="md"
            style={styles.mt12}
            onPress={() => {
              onDone();
              router.navigate('/coach');
            }}
          />
        </Card>
      ) : (
        <Card variant="accent">
          <Row gap={space[2]}>
            <Icon icon={Sparkles} size={18} tone="violet" />
            <Text variant="label" tone="violet">
              {t('checkin.teaserLabel')}
            </Text>
          </Row>
          <Text variant="h3" style={styles.mt8}>
            {t('checkin.teaserTitle')}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt4}>
            {t('checkin.teaserBody')}
          </Text>
          <Button
            label={t('checkin.teaserCta')}
            icon={Lock}
            size="md"
            style={styles.mt12}
            onPress={onUpgrade}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  center: {
    alignSelf: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  section: {
    marginTop: space[3],
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
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space[3],
    paddingHorizontal: 2,
  },
  moodLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  inputTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    gap: 4,
  },
  moneyInput: {
    flex: 1,
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    paddingVertical: 2,
    minWidth: 0,
  },
  netBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[4],
    gap: 4,
    marginTop: space[3],
  },
  hoursBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    marginTop: space[3],
  },
  hoursInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    width: 72,
    paddingVertical: 0,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[3],
    gap: 4,
  },
  metricInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    paddingVertical: 2,
  },
  energy: {
    flex: 1,
    height: 28,
    borderRadius: 6,
  },
  textArea: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  shots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  shot: {
    width: 72,
    height: 96,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  removeShot: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  goal: {
    gap: space[3],
    paddingHorizontal: space[1],
    paddingVertical: space[2],
  },
  goalInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: space[1],
  },
  resultTop: {
    alignItems: 'center',
    gap: space[2],
    paddingTop: space[4],
  },
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
});
