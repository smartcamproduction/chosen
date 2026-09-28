import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, BookOpen, Check, CircleCheck, Clock, ExternalLink, Lock, SearchX, SquareTerminal, Target, Wrench, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Card, Chip, EmptyState, Icon, IconButton, IconTile, Row, SectionHeader, Text } from '@/components/ui';
import { openPaywall } from '@/lib/paywall';
import { parseWeeks, type FlatStep } from '@/lib/roadmap';
import { isPremium } from '@/state/AppState';
import { useDuration, useRoadmap, useTier } from '@/state/hooks';
import { openStep, useStepActions } from '@/state/useStepActions';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function TaskDetail() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string; slot?: string }>();
  const slot: 1 | 2 = params.slot === '2' ? 2 : 1;
  const premium = isPremium(useTier());
  const { userHustle, roadmap, view } = useRoadmap(slot);
  const { complete, busyId } = useStepActions();
  const duration = useDuration();
  const [justDone, setJustDone] = useState(false);

  const step = view?.byId(params.id);
  if (!roadmap || !view || !step) {
    return (
      <Screen header={<StepHeader title="—" />}>
        <EmptyState icon={SearchX} title={t('task.missingTitle')} body={t('task.missingBody')} action={{ label: t('common.back'), onPress: () => router.back() }} />
      </Screen>
    );
  }

  const [from, to] = parseWeeks(step.phase.weeks);
  const nextStep: FlatStep | undefined = view.steps[step.index + 1];
  const done = step.state === 'done';
  const locked = step.state === 'locked';
  const hasAffiliate = step.tools.some((tool) => tool.affiliate);

  const markDone = async () => {
    const reward = await complete(userHustle?.id, step.id, roadmap);
    if (reward) setJustDone(true);
  };

  const open = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const footer = (
    <Row>
      <IconButton
        icon={premium ? SquareTerminal : Lock}
        size={56}
        accessibilityLabel={t('tabs.coach')}
        onPress={() => (premium ? router.navigate('/coach') : openPaywall('task'))}
        style={{ borderRadius: radius.lg }}
      />
      {done && justDone && nextStep ? (
        <Button label={t('task.nextStep')} iconRight={ArrowRight} onPress={() => openStep(nextStep, slot, true)} fullWidth={false} style={styles.flex} />
      ) : done ? (
        <Button label={t('task.completed')} icon={CircleCheck} variant="secondary" disabled fullWidth={false} style={styles.flex} />
      ) : locked ? (
        <Button label={t('task.lockedButton')} icon={Lock} variant="secondary" disabled fullWidth={false} style={styles.flex} />
      ) : (
        <Button
          label={t('task.markDone', { xp: step.xp })}
          icon={Check}
          onPress={markDone}
          loading={busyId === step.id}
          disabled={!userHustle}
          haptic={null}
          fullWidth={false}
          style={styles.flex}
        />
      )}
    </Row>
  );

  return (
    <Screen
      header={
        <StepHeader
          title={`${t('roadmap.phase', { n: step.phaseIndex + 1 })} · ${from === to ? t('roadmap.week', { n: from }) : t('roadmap.weeks', { from, to })}`}
          right={
            <Chip
              label={duration(step.est_minutes)}
              icon={Clock}
              tone="amber"
              size="md"
              caps={false}
            />
          }
        />
      }
      gap={space[3]}
      footer={footer}>
      <Row gap={space[2]} style={styles.wrap}>
        <Chip label={done ? t('task.done') : locked ? t('roadmap.locked') : t('task.current')} dot tone={done || !locked ? 'accent' : 'neutral'} />
        <Chip label={t('common.xp', { xp: step.xp })} icon={Zap} tone="amber" />
      </Row>

      <Text variant="label" tone="accent" style={styles.mt8}>
        {t('task.stepOf', { n: step.index + 1, total: view.total })} · {step.phase.title}
      </Text>
      <Text variant="h1">{step.title}</Text>

      {locked && view.current ? (
        <Card variant="elevated" padding={space[4]}>
          <Row align="flex-start">
            <IconTile icon={Lock} tone="neutral" size={36} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('task.lockedTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('task.lockedBody', { title: view.current.title })}
              </Text>
              <Button
                label={t('task.goCurrent')}
                iconRight={ArrowRight}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={styles.mt8}
                onPress={() => openStep(view.current!, slot, true)}
              />
            </View>
          </Row>
        </Card>
      ) : null}

      {justDone ? (
        <Card variant="accent" padding={space[4]}>
          <Row>
            <IconTile icon={CircleCheck} size={40} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('task.doneTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {nextStep ? t('task.doneNext', { title: nextStep.title }) : t('task.doneLast')}
              </Text>
            </View>
          </Row>
        </Card>
      ) : null}

      <Card variant="highlight">
        <Row align="flex-start">
          <IconTile icon={Target} size={36} />
          <View style={styles.flex}>
            <Text variant="label" tone="accent">
              {t('task.whyTitle')}
            </Text>
            <Text variant="body" style={styles.mt4}>
              {step.why}
            </Text>
          </View>
        </Row>
      </Card>

      <SectionHeader label={t('task.howTitle')} right={t('task.howCount', { count: step.instructions.length })} style={styles.section} />
      <Card padding={space[2]}>
        {step.instructions.map((line, i) => (
          <Row key={i} align="flex-start" style={[styles.instruction, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
            <View style={[styles.number, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
              <Text variant="monoSm" tone="accent" weight="semibold">
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={styles.flex}>
              {line}
            </Text>
          </Row>
        ))}
      </Card>

      {step.metric_to_track ? (
        <Card padding={space[4]}>
          <Row>
            <IconTile icon={Zap} tone="amber" size={36} />
            <View style={styles.flex}>
              <Text variant="label" tone="secondary">
                {t('task.trackTitle')}
              </Text>
              <Text variant="body" weight="semibold">
                {step.metric_to_track}
              </Text>
            </View>
          </Row>
        </Card>
      ) : null}

      {step.resources.length ? (
        <>
          <SectionHeader label={t('task.resources')} right={t('task.resourcesCount', { count: step.resources.length })} style={styles.section} />
          {step.resources.map((r) => (
            <Card key={r.url} padding={space[4]} onPress={() => open(r.url)} accessibilityLabel={r.title}>
              <Row>
                <IconTile icon={BookOpen} tone="neutral" size={36} />
                <View style={styles.flex}>
                  <Text variant="body" weight="semibold">
                    {r.title}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {hostOf(r.url)}
                  </Text>
                </View>
                <Icon icon={ExternalLink} size={18} tone="tertiary" />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {step.tools.length ? (
        <>
          <SectionHeader label={t('task.tools')} style={styles.section} />
          {/* Disclosure BEFORE the links (FTC / EU consumer rules). */}
          {hasAffiliate ? (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal', params: { doc: 'affiliate' } })} hitSlop={6}>
              <Text variant="caption" tone="secondary">
                {t('task.affiliateNote')} <Text variant="caption" tone="accent">{t('task.affiliateMore')}</Text>
              </Text>
            </Pressable>
          ) : null}
          {step.tools.map((tool) => (
            <Card
              key={tool.name}
              padding={space[4]}
              onPress={() => open(tool.url)}
              accessibilityLabel={tool.affiliate ? `${tool.name}, ${t('task.affiliate')}` : tool.name}>
              <Row>
                <View style={[styles.toolLogo, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
                  <Text variant="h3" tone="accent" maxFontSizeMultiplier={1.2}>
                    {tool.name[0]}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="body" weight="semibold">
                    {tool.name}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {hostOf(tool.url)}
                  </Text>
                </View>
                {tool.affiliate ? <Chip label={t('task.affiliate')} tone="violet" /> : null}
                <Icon icon={ExternalLink} size={18} tone="tertiary" />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {!step.resources.length && !step.tools.length ? (
        <Row gap={space[2]} style={styles.centerSelf}>
          <Icon icon={Wrench} size={14} tone="tertiary" />
          <Text variant="caption" tone="tertiary">
            {t('task.noTools')}
          </Text>
        </Row>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  centerSelf: {
    alignSelf: 'center',
  },
  mt4: {
    marginTop: 4,
  },
  mt8: {
    marginTop: space[2],
  },
  section: {
    marginTop: space[3],
  },
  instruction: {
    paddingHorizontal: space[2],
    paddingVertical: space[3],
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
