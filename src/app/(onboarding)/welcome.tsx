import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ArrowRight, BadgeCheck, Clock, Crosshair, ShieldCheck, Sparkles, SlidersHorizontal, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Dial } from '@/components/Dial';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, Icon, Row, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const dialSize = Math.min(280, width - 96);

  const steps = [
    { label: t('welcome.step1Label'), title: t('welcome.step1Title'), body: t('welcome.step1Body'), accent: false },
    { label: t('welcome.step2Label'), title: t('welcome.step2Title'), body: t('welcome.step2Body'), accent: false },
    { label: t('welcome.step3Label'), title: t('welcome.step3Title'), body: t('welcome.step3Body'), accent: true },
  ];

  return (
    <Screen header="minimal" gap={space[5]}>
      <Row style={styles.between}>
        <Chip label={t('welcome.badgeReady')} dot tone="neutral" />
        <Chip label={t('welcome.badgeAge')} icon={ShieldCheck} tone="neutral" />
      </Row>

      <View style={styles.center}>
        <Dial size={dialSize} label={t('welcome.dialLocked')} />
      </View>

      <View style={[styles.statStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Stat icon={Clock} label={t('welcome.stat30')} />
        <View style={[styles.sep, { backgroundColor: colors.borderStrong }]} />
        <Stat icon={BadgeCheck} label={t('welcome.stat15')} />
        <View style={[styles.sep, { backgroundColor: colors.borderStrong }]} />
        <Stat icon={Sparkles} label={t('welcome.statCoach')} accent />
      </View>

      <View style={styles.hero}>
        <Chip label={t('welcome.kicker')} icon={SlidersHorizontal} tone="accent" style={styles.selfCenter} />
        <Text variant="display" align="center">
          {t('welcome.title')}
        </Text>
        <Text variant="bodyLg" tone="secondary" align="center">
          {t('welcome.body')}
        </Text>
      </View>

      <Card>
        <SectionHeader label={t('welcome.pipelineTitle')} right={t('welcome.pipelineRight')} rightTone="accent" />
        <View style={styles.steps}>
          {steps.map((s) => (
            <View key={s.label} style={[styles.step, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
              <Text variant="label" tone="tertiary">
                {s.label}
              </Text>
              <Text variant="body" weight="semibold">
                {s.title}
              </Text>
              <Text variant="caption" tone={s.accent ? 'accent' : 'secondary'}>
                {s.body}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.ctaBlock}>
        <Button label={t('welcome.cta')} icon={Crosshair} iconRight={ArrowRight} onPress={() => router.push('/draw')} haptic="medium" />
        <Button label={t('welcome.haveAccount')} variant="ghost" size="md" onPress={() => router.push('/sign-in')} />
        <Row gap={space[2]} style={styles.selfCenter}>
          <Icon icon={Zap} size={14} tone="accent" />
          <Text variant="bodySm" tone="secondary">
            {t('welcome.free')}
          </Text>
        </Row>
        <Text variant="bodySm" tone="tertiary" align="center">
          {t('welcome.legal')}
        </Text>
        <Text variant="monoSm" tone="tertiary" align="center">
          {t('welcome.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
      </View>
    </Screen>
  );
}

function Stat({ icon, label, accent }: { icon: typeof Clock; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Icon icon={icon} size={16} tone={accent ? 'accent' : 'secondary'} />
      <Text variant="bodySm" weight="medium" tone={accent ? 'accent' : 'primary'} numberOfLines={1} style={styles.shrink}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  between: {
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  stat: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shrink: {
    flexShrink: 1,
  },
  sep: {
    width: 1,
    height: 18,
  },
  hero: {
    gap: space[3],
    paddingHorizontal: space[1],
  },
  selfCenter: {
    alignSelf: 'center',
  },
  steps: {
    flexDirection: 'row',
    gap: space[2],
    marginTop: space[4],
  },
  step: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    gap: 4,
  },
  ctaBlock: {
    gap: space[3],
    marginTop: space[1],
  },
});
