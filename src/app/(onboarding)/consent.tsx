import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, Brain, ChartColumn, Check, ExternalLink, FileText, Info, Shield, ShieldCheck, X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Card, Chip, Icon, IconTile, Row, Text, Toggle } from '@/components/ui';
import { ANTHROPIC_PRIVACY_URL } from '@/config';
import { useAccount } from '@/state/AccountProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Consent after the age check: AI coach data sharing (Claude by Anthropic)
 * and anonymous analytics are separate, optional choices.
 */
export default function Consent() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile, updateProfile } = useAccount();
  const [ai, setAi] = useState(!!profile?.ai_consent_at);
  const [analytics, setAnalytics] = useState(profile?.analytics_consent ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    setBusy(true);
    setError(null);
    const result = await updateProfile({
      ai_consent_at: ai ? (profile?.ai_consent_at ?? new Date().toISOString()) : null,
      analytics_consent: analytics,
    });
    setBusy(false);
    if (!result.ok) {
      setError(t('common.offline'));
      return;
    }
    router.push({ pathname: '/quiz/[step]', params: { step: '1' } });
  };

  const openLegal = (doc: 'terms' | 'privacy') => router.push({ pathname: '/legal', params: { doc } });

  const aiItems = [t('consent.aiItemQuiz'), t('consent.aiItemProgress'), t('consent.aiItemCheckins'), t('consent.aiItemMessages')];

  return (
    <Screen
      header={<StepHeader title={t('consent.kicker')} />}
      gap={space[3]}
      footer={
        <>
          <Button label={t('consent.cta')} iconRight={ArrowRight} onPress={next} loading={busy} haptic="medium" />
          {error ? (
            <Text variant="bodySm" tone="danger" align="center">
              {error}
            </Text>
          ) : null}
        </>
      }>
      <View style={styles.intro}>
        <Chip label={t('consent.kicker')} icon={ShieldCheck} tone="accent" />
        <Text variant="h1">{t('consent.title')}</Text>
        <Text variant="body" tone="secondary">
          {t('consent.body')}
        </Text>
      </View>

      <Card padding={space[4]}>
        <Row align="flex-start">
          <IconTile icon={Brain} tone="violet" size={40} />
          <View style={styles.flex}>
            <Text variant="h3">{t('consent.aiTitle')}</Text>
            <Chip label={t('consent.optional')} style={styles.badge} />
          </View>
        </Row>
        <Text variant="bodySm" tone="secondary" style={styles.mt12}>
          {t('consent.aiBody')}
        </Text>
        <View style={styles.list}>
          {aiItems.map((item) => (
            <Row key={item} gap={space[2]} align="flex-start">
              <Icon icon={Check} size={14} tone="accent" strokeWidth={2} />
              <Text variant="bodySm" style={styles.flex}>
                {item}
              </Text>
            </Row>
          ))}
        </View>
        <View style={[styles.note, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
          <Icon icon={X} size={14} tone="secondary" />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {t('consent.aiNotSent')}
          </Text>
        </View>
        <LegalLink icon={ExternalLink} label={t('consent.aiLearnMore')} onPress={() => WebBrowser.openBrowserAsync(ANTHROPIC_PRIVACY_URL).catch(() => {})} />
        <View style={[styles.toggleRow, { borderTopColor: colors.divider }]}>
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {t('consent.aiToggle')}
            </Text>
            {!ai ? (
              <Text variant="caption" tone="secondary">
                {t('consent.aiOff')}
              </Text>
            ) : null}
          </View>
          <Toggle value={ai} onChange={setAi} accessibilityLabel={t('consent.aiToggle')} />
        </View>
      </Card>

      <Card padding={space[4]}>
        <Row align="flex-start">
          <IconTile icon={ChartColumn} tone="neutral" size={40} />
          <View style={styles.flex}>
            <Text variant="h3">{t('consent.analyticsTitle')}</Text>
            <Chip label={t('consent.optional')} style={styles.badge} />
          </View>
        </Row>
        <Text variant="bodySm" tone="secondary" style={styles.mt12}>
          {t('consent.analyticsBody')}
        </Text>
        <View style={[styles.toggleRow, { borderTopColor: colors.divider }]}>
          <Text variant="body" weight="semibold" style={styles.flex}>
            {t('consent.analyticsToggle')}
          </Text>
          <Toggle value={analytics} onChange={setAnalytics} accessibilityLabel={t('consent.analyticsToggle')} />
        </View>
      </Card>

      <Card padding={space[4]}>
        <Text variant="bodySm" tone="secondary">
          {t('consent.legalIntro')}
        </Text>
        <View style={styles.links}>
          <LegalLink icon={FileText} label={t('consent.terms')} onPress={() => openLegal('terms')} />
          <LegalLink icon={Shield} label={t('consent.privacy')} onPress={() => openLegal('privacy')} />
        </View>
        <View style={[styles.note, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
          <Icon icon={Info} size={14} tone="secondary" />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {t('consent.disclaimer')}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

function LegalLink({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.link, { backgroundColor: colors.elevated, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
      <Icon icon={icon} size={16} />
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Icon icon={ExternalLink} size={14} tone="tertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: space[2],
    marginBottom: space[2],
  },
  flex: {
    flex: 1,
  },
  badge: {
    marginTop: 6,
  },
  mt12: {
    marginTop: space[3],
  },
  list: {
    gap: space[2],
    marginTop: space[3],
  },
  note: {
    flexDirection: 'row',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    marginTop: space[3],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderTopWidth: 1,
    marginTop: space[4],
    paddingTop: space[3],
  },
  links: {
    gap: space[2],
    marginTop: space[3],
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    marginTop: space[3],
  },
});
