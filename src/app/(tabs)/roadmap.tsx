import { router } from 'expo-router';
import { Bot, Check, CircleCheck, Clock, Flag, Lock, Sparkles, Target, TrendingUp, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card, Chip, EmptyState, Icon, IconTile, ProgressBar, Row, SectionHeader, Text } from '@/components/ui';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatNumber, pad2 } from '@/lib/format';
import { parseWeeks, type FlatStep, type StepState } from '@/lib/roadmap';
import { useL } from '@/lib/l10n';
import { openPaywall } from '@/lib/paywall';
import { isPremium } from '@/state/AppState';
import { useAccount } from '@/state/AccountProvider';
import { useDuration, useNow, useRoadmap, useTier } from '@/state/hooks';
import { requestPersonalization } from '@/state/RoadmapsProvider';
import { openStep, useStepActions } from '@/state/useStepActions';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Filter = 'all' | 'active';

export default function RoadmapTab() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const [filter, setFilter] = useState<Filter>('all');
  const premium = isPremium(useTier());
  const { hustle, userHustle, dayNumber, roadmap, view, source } = useRoadmap();
  const { complete, busyId } = useStepActions();

  if (!roadmap || !view) {
    return (
      <Screen bottomInset={false}>
        <Card>
          <EmptyState icon={Flag} title={t('roadmap.missingTitle')} body={t('roadmap.missingBody')} />
        </Card>
      </Screen>
    );
  }

  const week = Math.min(roadmap.total_weeks, Math.ceil(dayNumber / 7));
  const currentPhase = roadmap.phases[view.currentPhaseIndex];
  const percent = view.total ? Math.round((view.doneCount / view.total) * 100) : 0;
  const phases = roadmap.phases
    .map((phase, index) => ({ phase, index }))
    .filter(({ index }) => filter === 'all' || view.phaseStates[index] === 'current');

  return (
    <Screen bottomInset={false} gap={space[3]}>
      <Card>
        <Row style={styles.between}>
          <Row gap={space[2]}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text variant="label" tone="secondary">
              {t('roadmap.sprintHustle')}
            </Text>
          </Row>
          <Chip label={l(hustle.name)} tone="accent" style={styles.shrink} />
        </Row>
        <Row style={[styles.between, styles.mt12]} align="flex-end">
          <View style={styles.flex}>
            <Text variant="h2">{t('roadmap.title', { weeks: roadmap.total_weeks })}</Text>
            <Text variant="bodySm" tone="secondary">
              {view.complete
                ? t('roadmap.subtitleDone')
                : t('roadmap.subtitle', { week, total: roadmap.total_weeks, phase: view.currentPhaseIndex + 1 })}
            </Text>
          </View>
          <View style={styles.right}>
            <Text variant="metricXl" tone="accent">
              {percent}%
            </Text>
            <Text variant="monoSm" tone="secondary">
              {formatNumber(view.xpDone, language)} / {formatNumber(view.xpTotal, language)} XP
            </Text>
          </View>
        </Row>
        <ProgressBar value={view.total ? view.doneCount / view.total : 0} style={styles.mt12} />
        <Row style={[styles.between, styles.mt12]} align="flex-start">
          <Row gap={6} style={styles.shrink} align="flex-start">
            <View style={styles.iconNudge}>
              <Icon icon={Target} size={14} tone="accent" />
            </View>
            <Text variant="bodySm" tone="secondary" style={styles.shrink}>
              {currentPhase.goal}
            </Text>
          </Row>
          <Text variant="metricMd">{t('roadmap.steps', { done: view.doneCount, total: view.total })}</Text>
        </Row>
      </Card>

      {source === 'personalized' ? (
        <Chip label={t('roadmap.personalized')} icon={Sparkles} tone="accent" size="md" caps={false} />
      ) : premium ? (
        <PersonalizationBanner />
      ) : !premium ? (
        <Card variant="elevated" padding={space[4]}>
          <Row>
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('roadmap.baseTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('roadmap.baseBody')}
              </Text>
            </View>
            <Button label={t('common.upgrade')} size="sm" fullWidth={false} onPress={() => openPaywall('roadmap')} />
          </Row>
        </Card>
      ) : null}

      <Row gap={space[2]} style={styles.wrap}>
        <Chip label={t('roadmap.filterAll', { count: roadmap.phases.length })} caps={false} size="md" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={t('roadmap.filterActive')} caps={false} size="md" selected={filter === 'active'} onPress={() => setFilter('active')} />
      </Row>

      {phases.length === 0 ? (
        <Card>
          <EmptyState icon={CircleCheck} title={t('roadmap.allDoneTitle')} body={t('roadmap.allDoneBody')} action={{ label: t('roadmap.filterAll', { count: roadmap.phases.length }), onPress: () => setFilter('all') }} />
        </Card>
      ) : (
        <View>
          {phases.map(({ phase, index }, i) => {
            const state = view.phaseStates[index];
            const isFinal = index === roadmap.phases.length - 1;
            const [from, to] = parseWeeks(phase.weeks);
            const steps = view.steps.filter((s) => s.phaseIndex === index);
            const xpPhase = steps.reduce((sum, s) => sum + s.xp, 0);
            return (
              <View key={phase.id} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <PhaseNode state={state} final={isFinal} />
                  {i < phases.length - 1 ? <View style={[styles.line, { backgroundColor: state === 'done' ? colors.accent : colors.borderStrong }]} /> : null}
                </View>
                <View style={[styles.phaseWrap, state === 'locked' && styles.lockedPhase]}>
                  <Card padding={space[4]}>
                    <Row style={styles.between} align="flex-start">
                      <Row gap={6} style={styles.shrink}>
                        <Text variant="label" tone={state === 'current' ? 'accent' : 'secondary'}>
                          {t('roadmap.phase', { n: pad2(index + 1) })}
                        </Text>
                        <Text variant="caption" tone="tertiary">
                          · {from === to ? t('roadmap.week', { n: from }) : t('roadmap.weeks', { from, to })}
                        </Text>
                      </Row>
                      {state === 'done' ? (
                        <Chip label={t('roadmap.xpDone', { xp: formatNumber(xpPhase, language) })} tone="accent" />
                      ) : state === 'current' ? (
                        <Chip label={t('roadmap.current')} tone="solid" />
                      ) : isFinal ? (
                        <Chip label={t('roadmap.final')} icon={Flag} />
                      ) : (
                        <Chip label={t('roadmap.locked')} icon={Lock} />
                      )}
                    </Row>
                    <Text variant="h3" tone={state === 'locked' ? 'secondary' : 'primary'} style={styles.mt8}>
                      {phase.title}
                    </Text>
                    <Text variant="bodySm" tone="secondary" style={styles.mt4}>
                      {phase.goal}
                    </Text>
                    <View style={styles.steps}>
                      {steps.map((step) =>
                        step.state === 'current' ? (
                          <ActiveStep
                            key={step.id}
                            step={step}
                            busy={busyId === step.id}
                            disabled={!userHustle}
                            onComplete={() => complete(userHustle?.id, step.id, roadmap)}
                          />
                        ) : (
                          <StepRow key={step.id} step={step} />
                        ),
                      )}
                    </View>
                  </Card>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {roadmap.earning_milestones.length ? (
        <Card>
          <Row gap={space[2]}>
            <Icon icon={TrendingUp} size={18} tone="accent" />
            <Text variant="label" tone="secondary">
              {t('roadmap.milestonesTitle')}
            </Text>
          </Row>
          <View style={styles.milestones}>
            {roadmap.earning_milestones.map((m, i) => (
              <View key={i} style={[styles.milestone, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <Row style={styles.between} align="flex-start">
                  <Text variant="body" weight="semibold" style={styles.shrink}>
                    {m.label}
                  </Text>
                  <Text variant="metricMd" tone="accent" align="right" style={styles.shrink}>
                    {m.range}
                  </Text>
                </Row>
                <Text variant="caption" tone="secondary">
                  {m.note}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="tertiary" style={styles.mt8}>
            {t('roadmap.milestonesNote')}
          </Text>
        </Card>
      ) : null}

      <SectionHeader label={t('roadmap.helpTitle')} style={styles.mt8} />
      <Card padding={space[4]}>
        <Row>
          <IconTile icon={Bot} tone="violet" size={44} />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {t('roadmap.stuckTitle')}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {t('roadmap.stuckBody')}
            </Text>
          </View>
          <Button
            label={t('roadmap.askCoach')}
            icon={premium ? undefined : Lock}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => (premium ? router.navigate('/coach') : openPaywall('roadmap'))}
          />
        </Row>
      </Card>
    </Screen>
  );
}

/** Pro / Elite: status of the AI-personalized roadmap (the base one is used meanwhile). */
function PersonalizationBanner() {
  const { t } = useTranslation();
  const { mode, profile, refresh } = useAccount();
  const { userHustle } = useRoadmap();
  const now = useNow();
  const [retrying, setRetrying] = useState(false);
  if (mode !== 'supabase' || !userHustle) return null;

  if (profile?.tier === 'free') return null;
  if (!profile?.ai_consent_at) {
    return (
      <Card variant="elevated" padding={space[4]} onPress={() => router.navigate('/profile')} accessibilityLabel={t('roadmap.aiOffTitle')}>
        <Row>
          <IconTile icon={Sparkles} tone="neutral" size={40} />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {t('roadmap.aiOffTitle')}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {t('roadmap.aiOffBody')}
            </Text>
          </View>
        </Row>
      </Card>
    );
  }

  const startedAt = userHustle.personalization_started_at ? Date.parse(userHustle.personalization_started_at) : 0;
  const stuck = userHustle.personalization_status === 'pending' && now - startedAt > 5 * 60_000;
  const working = (userHustle.personalization_status === 'pending' && !stuck) || (!userHustle.personalization_status && !retrying);
  const retry = async () => {
    setRetrying(true);
    await requestPersonalization(userHustle.id);
    await refresh().catch(() => {});
    setRetrying(false);
  };

  if (working || retrying) {
    return (
      <Card variant="elevated" padding={space[4]}>
        <Row>
          <ActivityIndicator />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {t('roadmap.personalizingTitle')}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {t('roadmap.personalizingBody')}
            </Text>
          </View>
        </Row>
      </Card>
    );
  }
  return (
    <Card variant="elevated" padding={space[4]}>
      <Row>
        <IconTile icon={Sparkles} tone="amber" size={40} />
        <View style={styles.flex}>
          <Text variant="body" weight="semibold">
            {t('roadmap.personalizeFailedTitle')}
          </Text>
          <Text variant="bodySm" tone="secondary">
            {t('roadmap.personalizeFailedBody')}
          </Text>
        </View>
        <Button label={t('common.retry')} size="sm" variant="secondary" fullWidth={false} onPress={retry} />
      </Row>
    </Card>
  );
}

function PhaseNode({ state, final }: { state: StepState; final: boolean }) {
  const { colors } = useTheme();
  if (state === 'done') {
    return (
      <View style={[styles.node, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
        <Check size={14} color={colors.accentText} strokeWidth={2.5} />
      </View>
    );
  }
  if (state === 'current') {
    return (
      <View style={[styles.node, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View style={[styles.nodeDot, { backgroundColor: colors.accent, boxShadow: `0 0 10px ${colors.accent}` }]} />
      </View>
    );
  }
  return (
    <View style={[styles.node, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
      <Icon icon={final ? Flag : Lock} size={12} tone="tertiary" />
    </View>
  );
}

function Duration({ minutes }: { minutes: number }) {
  const duration = useDuration();
  return <>{duration(minutes)}</>;
}

function StepRow({ step }: { step: FlatStep }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const locked = step.state === 'locked';
  const done = step.state === 'done';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${step.title}. ${done ? t('task.done') : t('roadmap.locked')}`}
      onPress={() => openStep(step)}
      style={({ pressed }) => [styles.stepRow, { backgroundColor: colors.elevated, borderColor: colors.border }, pressed && styles.pressed]}>
      <Icon icon={done ? CircleCheck : Lock} size={16} tone={done ? 'accent' : 'tertiary'} />
      <Text variant="bodySm" tone={done ? 'tertiary' : locked ? 'secondary' : 'primary'} strike={done} numberOfLines={1} style={styles.flex}>
        {step.title}
      </Text>
      <Text variant="monoSm" tone="secondary">
        {t('common.xp', { xp: step.xp })}
      </Text>
      <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
      <Text variant="monoSm" tone="secondary" style={styles.dur}>
        <Duration minutes={step.est_minutes} />
      </Text>
    </Pressable>
  );
}

function ActiveStep({ step, busy, disabled, onComplete }: { step: FlatStep; busy: boolean; disabled: boolean; onComplete: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.active, { backgroundColor: colors.elevated, borderColor: colors.borderStrong, borderLeftColor: colors.accent }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={step.title} onPress={() => openStep(step)} style={({ pressed }) => [styles.activeBody, pressed && styles.pressed]}>
        <Row style={styles.between}>
          <Row gap={6}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text variant="label" tone="accent">
              {t('roadmap.currentStep')}
            </Text>
          </Row>
          <Chip label={t('common.xp', { xp: step.xp })} icon={Zap} tone="amber" />
        </Row>
        <Text variant="h3">{step.title}</Text>
        <Text variant="bodySm" tone="secondary" numberOfLines={3}>
          {step.why}
        </Text>
      </Pressable>
      <Row style={[styles.between, styles.mt8]}>
        <Row gap={6} style={styles.shrink}>
          <Icon icon={Clock} size={14} />
          <Text variant="caption" tone="secondary">
            <Duration minutes={step.est_minutes} />
          </Text>
          <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
          <Pressable accessibilityRole="button" onPress={() => openStep(step)} hitSlop={8}>
            <Text variant="caption" tone="accent" weight="semibold">
              {t('roadmap.details')}
            </Text>
          </Pressable>
        </Row>
        <Button label={t('roadmap.complete')} iconRight={Check} size="sm" fullWidth={false} onPress={onComplete} loading={busy} disabled={disabled} haptic={null} />
      </Row>
    </View>
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
  right: {
    alignItems: 'flex-end',
  },
  pressed: {
    opacity: 0.8,
  },
  iconNudge: {
    marginTop: 2,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  rail: {
    width: 24,
    alignItems: 'center',
  },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[4],
  },
  nodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 4,
    borderRadius: 1,
  },
  phaseWrap: {
    flex: 1,
    paddingBottom: space[3],
  },
  lockedPhase: {
    opacity: 0.6,
  },
  steps: {
    gap: space[2],
    marginTop: space[3],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: 10,
  },
  vsep: {
    width: 1,
    height: 12,
  },
  dur: {
    minWidth: 40,
    textAlign: 'right',
  },
  active: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: space[3],
    gap: space[2],
  },
  activeBody: {
    gap: space[2],
  },
  milestones: {
    marginTop: space[3],
  },
  milestone: {
    paddingVertical: space[3],
    gap: 4,
  },
});
