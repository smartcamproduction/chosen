import type { Href } from 'expo-router';
import { ArrowRight, CalendarCheck, CircleCheck, Lock, Repeat, TriangleAlert, Layers, Zap, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SignInButtons } from '@/components/SignInButtons';
import { Button, Card, Checkbox, Icon, IconTile, Row, Text } from '@/components/ui';
import type { Hustle } from '@/data/hustles';
import { useLanguage } from '@/i18n/LanguageProvider';
import { track } from '@/lib/analytics';
import { chooseTarget } from '@/lib/commitment';
import { formatDate } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { useAccount, type ChooseError } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { needsOnboarding, nextRoute, useTier } from '@/state/hooks';
import { useHustles } from '@/state/HustlesProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface Props {
  hustle: Hustle;
  /** Spend a Fast Pivot to switch before the 30 days are over. */
  pivot?: boolean;
  /** Lock-in succeeded. */
  onDone: () => void;
  /** Leave to another screen (sign-up steps). */
  onNavigate: (route: Href) => void;
}

/**
 * The 30-day commitment: rules, pledge, then whatever the user needs next:
 * sign in → finish setup → lock in (or confirm a free switch / Fast Pivot).
 */
export function CommitmentPanel({ hustle, pivot = false, onDone, onNavigate }: Props) {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { state, update } = useApp();
  const account = useAccount();
  const tier = useTier();
  const { byId } = useHustles();
  const haptics = useHaptics();
  const [pledged, setPledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const target = chooseTarget(account.userHustles, tier, hustle.id, now);
  const current = target.kind === 'replace' || target.kind === 'locked' ? byId(target.current.hustle_id) : undefined;
  const currentName = current ? l(current.name) : '';
  const nextName = l(hustle.name);

  const errorText = (e: ChooseError) => {
    switch (e) {
      case 'locked':
        return t('commit.errorLocked');
      case 'no_credits':
        return t('commitSheet.errorNoCredits');
      case 'confirm_required':
        return t('commitSheet.errorConfirm');
      case 'hustle_not_available':
        return t('commit.errorNotAvailable');
      case 'offline':
        return t('common.offline');
      default:
        return t('commit.errorGeneric');
    }
  };

  const lockIn = async () => {
    if (busy) return;
    if (account.mode === 'supabase' && !hustle.fromServer) {
      setError(t('common.offline'));
      return;
    }
    const slot = target.kind === 'same' ? 1 : target.slot;
    setBusy(true);
    setError(null);
    const result = await account.chooseHustle(hustle.id, {
      slot,
      replaceCurrent: target.kind === 'replace',
      useFastPivot: pivot && target.kind === 'locked',
    });
    setBusy(false);
    if (!result.ok) {
      haptics('error');
      setError(errorText(result.error));
      return;
    }
    haptics('success');
    const viaPivot = pivot && target.kind === 'locked';
    track('hustle_chosen', { hustle: hustle.slug, slot, kind: target.kind, fast_pivot: viaPivot, tier });
    if (viaPivot) track('fast_pivot_used', { slot, via: 'direct_switch', hustle: hustle.slug });
    update({ pendingHustleId: null, quizDraft: {} });
    onDone();
  };

  const rules: { icon: LucideIcon; text: string }[] = [
    { icon: CircleCheck, text: t('commitSheet.rule1') },
    { icon: CalendarCheck, text: t('commitSheet.rule2') },
    { icon: Repeat, text: t('commitSheet.rule3') },
  ];

  const lockedWithoutPivot = target.kind === 'locked' && !pivot;
  const showWarning = target.kind === 'replace' || (pivot && target.kind === 'locked');

  return (
    <View style={styles.wrap}>
      <Row align="flex-start">
        <IconTile icon={hustle.icon} size={44} />
        <View style={styles.flex}>
          <Text variant="label" tone="accent">
            {t('commitSheet.title')}
          </Text>
          <Text variant="h2">{nextName}</Text>
        </View>
      </Row>

      <Text variant="body" tone="secondary">
        {t('commitSheet.body')}
      </Text>
      <View style={styles.rules}>
        {rules.map((r) => (
          <Row key={r.text} gap={space[3]} align="flex-start">
            <Icon icon={r.icon} size={18} tone="accent" />
            <Text variant="bodySm" style={styles.flex}>
              {r.text}
            </Text>
          </Row>
        ))}
      </View>

      {showWarning ? (
        <Card variant="elevated" padding={space[4]} style={{ borderColor: colors.amberBorder }}>
          <Row gap={space[2]}>
            <Icon icon={pivot ? Zap : TriangleAlert} size={18} tone="amber" />
            <Text variant="body" weight="semibold" tone="amber">
              {pivot ? t('commitSheet.pivotTitle') : t('commitSheet.replaceTitle')}
            </Text>
          </Row>
          <Text variant="bodySm" tone="secondary" style={styles.mt8}>
            {pivot ? t('commitSheet.pivotBody', { current: currentName, next: nextName }) : t('commitSheet.replaceBody', { current: currentName, next: nextName })}
          </Text>
        </Card>
      ) : null}

      {target.kind === 'free' && target.slot === 2 ? (
        <Card variant="elevated" padding={space[4]} style={{ borderColor: colors.violetBorder }}>
          <Row gap={space[2]}>
            <Icon icon={Layers} size={18} tone="violet" />
            <Text variant="body" weight="semibold" tone="violet">
              {t('commitSheet.slot2Title')}
            </Text>
          </Row>
          <Text variant="bodySm" tone="secondary" style={styles.mt8}>
            {t('commitSheet.slot2Body')}
          </Text>
        </Card>
      ) : null}

      {target.kind === 'same' ? (
        <Text variant="body" tone="secondary">
          {t('result.alreadyActive')}
        </Text>
      ) : lockedWithoutPivot ? (
        <Card variant="elevated" padding={space[4]}>
          <Row gap={space[2]}>
            <Icon icon={Lock} size={18} />
            <Text variant="body" weight="semibold">
              {t('commitSheet.lockedTitle')}
            </Text>
          </Row>
          <Text variant="bodySm" tone="secondary" style={styles.mt8}>
            {t('commitSheet.lockedBody', { current: currentName, date: formatDate(target.until, language, true) })}
          </Text>
        </Card>
      ) : account.signedIn && needsOnboarding(account.profile) ? (
        <Card variant="elevated" padding={space[4]}>
          <Text variant="body" tone="secondary">
            {t('commit.setupBody')}
          </Text>
          <Button
            label={t('commit.continueSetup')}
            iconRight={ArrowRight}
            onPress={() => onNavigate(nextRoute(account, state))}
            style={styles.mt12}
          />
        </Card>
      ) : (
        <>
          <View style={[styles.pledge, { backgroundColor: colors.recessed, borderColor: pledged ? colors.accentBorder : colors.border }]}>
            <Checkbox checked={pledged} onChange={setPledged} accessibilityLabel={t('commit.pledgeTitle')} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: pledged }} onPress={() => setPledged(!pledged)} style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('commit.pledgeTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('commit.pledgeBody')}
              </Text>
            </Pressable>
          </View>

          {account.signedIn ? (
            <Button
              label={pivot ? t('commitSheet.pivotCta') : target.kind === 'replace' ? t('commitSheet.switchCta') : t('commit.lockIn')}
              icon={Lock}
              onPress={lockIn}
              disabled={!pledged}
              loading={busy}
              haptic={null}
            />
          ) : (
            <>
              <View style={styles.signInHead}>
                <Text variant="h3">{t('commit.signInTitle')}</Text>
                <Text variant="bodySm" tone="secondary">
                  {t('commit.signInBody')}
                </Text>
              </View>
              <SignInButtons
                disabled={!pledged}
                onSignedIn={({ snapshot }) => {
                  // Finished setup before → stay here and lock in. Otherwise go through the steps.
                  if (needsOnboarding(snapshot.profile)) onNavigate(nextRoute({ signedIn: true, ...snapshot }, state));
                }}
              />
            </>
          )}
          {!pledged ? (
            <Text variant="caption" tone="amber" align="center">
              {t('commit.pledgeFirst')}
            </Text>
          ) : null}
        </>
      )}

      {error ? (
        <Text variant="bodySm" tone="danger" align="center">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="tertiary" align="center">
        {t('commit.legal')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
  rules: {
    gap: space[2],
  },
  mt8: {
    marginTop: space[2],
  },
  mt12: {
    marginTop: space[3],
  },
  pledge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
  },
  signInHead: {
    gap: 4,
    marginTop: space[2],
  },
});
