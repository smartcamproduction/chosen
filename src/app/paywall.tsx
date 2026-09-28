import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, Check, CircleCheck, CircleAlert, Info, Lock, MessageSquare, RotateCcw, ShieldCheck, X, Zap, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, Divider, Icon, IconButton, IconTile, Row, Segmented, Text } from '@/components/ui';
import { PRIVACY_URL, TERMS_URL } from '@/config';
import { useLanguage } from '@/i18n/LanguageProvider';
import { track } from '@/lib/analytics';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { isPaywallSource, type PaywallSource } from '@/lib/paywall';
import { formatPrice, MESSAGES_PACK, yearlySavings, type Billing, type OneTimeItem, type PaidTier, type PlanPrice } from '@/lib/plans';
import type { PurchaseFailure } from '@/lib/purchases';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { useActiveHustle, useTier } from '@/state/hooks';
import { usePurchases, type PurchasesMode } from '@/state/PurchasesProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, radius, space } from '@/theme/tokens';

/**
 * The paywall.
 *   /paywall?source=coach&plan=elite      – Pro vs Elite subscriptions
 *   /paywall?item=fast_pivot | messages   – one-time purchases
 * Prices, trials and the preselected plan come from RevenueCat Offerings
 * (change them or run A/B tests in RevenueCat, no app update needed).
 */
export default function Paywall() {
  const params = useLocalSearchParams<{ source?: string; plan?: string; item?: string }>();
  const item: OneTimeItem | null = params.item === 'fast_pivot' || params.item === 'messages' ? params.item : null;

  useEffect(() => {
    track('paywall_viewed', { source: params.source ?? (item ? item : null), item, plan: params.plan ?? null });
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (item) return <OneTimePaywall item={item} />;
  const source: PaywallSource | null = isPaywallSource(params.source) ? params.source : null;
  const plan: PaidTier | null = params.plan === 'pro' || params.plan === 'elite' ? params.plan : null;
  return <PlanPaywall source={source} preselect={plan} />;
}

const close = () => (router.canGoBack() ? router.back() : router.replace('/today'));
const openLink = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

function useFailureText() {
  const { t } = useTranslation();
  return (reason: PurchaseFailure): string | null => {
    switch (reason) {
      case 'cancelled':
        return null;
      case 'pending':
        return t('paywall.errorPending');
      case 'not_allowed':
        return t('paywall.errorNotAllowed');
      case 'network':
        return t('common.offline');
      case 'already_owned':
        return t('paywall.errorOwned');
      case 'unavailable':
        return t('paywall.unavailableBody');
      default:
        return t('paywall.errorFailed');
    }
  };
}

/* ------------------------------------------------------------------ */
/* Subscriptions: Pro vs Elite                                         */
/* ------------------------------------------------------------------ */

function PlanPaywall({ source, preselect }: { source: PaywallSource | null; preselect: PaidTier | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { update } = useApp();
  const haptics = useHaptics();
  const purchases = usePurchases();
  const tier = useTier();
  const failureText = useFailureText();
  const [billingChoice, setBillingChoice] = useState<Billing | null>(null);
  const [planChoice, setPlanChoice] = useState<PaidTier | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const { catalog } = purchases;
  const billing = billingChoice ?? catalog.defaultBilling;
  // Pro users are here for Elite.
  const plan: PaidTier = planChoice ?? (tier === 'pro' ? 'elite' : (preselect ?? catalog.defaultTier));
  const selected = catalog.plans[plan][billing] ?? catalog.plans[plan][billing === 'yearly' ? 'monthly' : 'yearly'];
  const saving = yearlySavings(catalog, plan);
  const trialDays = selected && selected.trialDays > 0 && purchases.isTrialEligible(selected.productId) ? selected.trialDays : 0;
  const planName = (p: PaidTier) => (p === 'elite' ? t('paywall.elite') : t('paywall.pro'));
  const periodText = (p: PlanPrice) => (p.billing === 'yearly' ? t('paywall.periodYearly') : t('paywall.periodMonthly'));
  const perSuffix = (p: PlanPrice) => (p.billing === 'yearly' ? t('paywall.perYear') : t('paywall.perMonth'));

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    const result = await purchases.restore();
    setBusy(null);
    if (!result.ok) {
      const text = result.reason === 'unavailable' ? t('paywall.unavailableBody') : failureText(result.reason);
      if (text) Alert.alert(t('paywall.restoreFailed'), text);
      return;
    }
    if (result.tier === 'free') {
      Alert.alert(t('paywall.restoreNothing'));
      return;
    }
    haptics('success');
    Alert.alert(t('paywall.restoredTitle'), t('paywall.restoredBody', { plan: planName(result.tier) }), [{ text: t('common.done'), onPress: close }]);
  };

  const buy = async () => {
    if (busy || !selected) return;
    setBusy('buy');
    const result = await purchases.buyPlan(selected.tier, selected.billing);
    setBusy(null);
    if (!result.ok) {
      if (result.reason === 'cancelled') return;
      haptics('error');
      if (result.reason === 'unavailable' && __DEV__) {
        // Development only: preview the paid screens on this device.
        Alert.alert(t('paywall.unavailableTitle'), t('paywall.unavailableBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('paywall.devSwitch'),
            onPress: () => {
              update({ devTier: selected.tier });
              close();
            },
          },
        ]);
        return;
      }
      Alert.alert(result.reason === 'unavailable' ? t('paywall.unavailableTitle') : t('common.error'), failureText(result.reason) ?? '');
      return;
    }
    haptics('success');
    if (result.confirmed) {
      Alert.alert(
        t('paywall.successTitle', { plan: planName(selected.tier) }),
        trialDays ? t('paywall.successTrialBody', { count: trialDays }) : t('paywall.successBody'),
        [{ text: t('common.continue'), onPress: close }],
      );
    } else {
      Alert.alert(t('paywall.pendingTitle'), t('paywall.pendingBody'), [{ text: t('common.done'), onPress: close }]);
    }
  };

  const header = <PaywallHeader onRestore={restore} restoring={busy === 'restore'} />;

  if (tier === 'elite') {
    return (
      <Screen header={header} gap={space[4]}>
        <OnElite />
      </Screen>
    );
  }

  const ctaLabel = !selected
    ? t('paywall.loadingPrices')
    : trialDays
      ? t('paywall.ctaTrial', { count: trialDays })
      : tier === 'pro'
        ? t('paywall.ctaUpgrade', { plan: planName(selected.tier) })
        : t('paywall.ctaSubscribe', { plan: planName(selected.tier) });
  const ctaSub = selected
    ? trialDays
      ? t('paywall.ctaSub', { price: `${selected.priceString}${perSuffix(selected)}` })
      : t('paywall.ctaSubPaid', { price: `${selected.priceString}${perSuffix(selected)}` })
    : undefined;
  const showPlans = !purchases.loading && !purchases.loadFailed;

  return (
    <Screen
      header={header}
      gap={space[3]}
      footer={
        showPlans ? (
          <>
            <Button label={ctaLabel} iconRight={ArrowRight} sublabel={ctaSub} onPress={buy} loading={busy === 'buy'} disabled={!selected || !!busy} haptic="medium" />
            <Row gap={6} style={styles.center}>
              <Icon icon={Lock} size={12} tone="tertiary" />
              <Text variant="label" tone="tertiary">
                {t('paywall.secure')}
              </Text>
            </Row>
          </>
        ) : undefined
      }>
      <Chip label={t('paywall.kicker')} icon={Zap} tone="accent" style={styles.center} />
      <Text variant="h1" align="center">
        {t('paywall.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center">
        {hasContext(source) ? t(`paywall.context.${source}`) : t('paywall.body')}
      </Text>

      <PricesNotice mode={purchases.mode} realPrices={purchases.realPrices} />

      {purchases.loading ? (
        <Card>
          <Row gap={space[3]} style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="body" tone="secondary">
              {t('paywall.loadingPrices')}
            </Text>
          </Row>
        </Card>
      ) : purchases.loadFailed ? (
        <Card>
          <Row align="flex-start">
            <IconTile icon={CircleAlert} tone="amber" size={40} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('paywall.loadFailedTitle')}
              </Text>
              <Text variant="bodySm" tone="secondary">
                {t('paywall.loadFailedBody')}
              </Text>
            </View>
          </Row>
          <Button label={t('common.retry')} icon={RotateCcw} variant="secondary" size="md" onPress={purchases.reload} style={styles.mt12} />
        </Card>
      ) : (
        <>
          <Segmented<Billing>
            value={billing}
            onChange={setBillingChoice}
            style={styles.mt8}
            options={[
              { value: 'monthly', label: t('paywall.monthly') },
              { value: 'yearly', label: t('paywall.yearly'), badge: saving ? t('paywall.save', { percent: saving.percent }) : undefined },
            ]}
          />
          {selected ? (
            <Text variant="caption" tone="secondary" align="center">
              {selected.billing === 'yearly'
                ? saving
                  ? t('paywall.billedYearly', { price: selected.priceString, saved: formatPrice(saving.amount, selected.currency, language) })
                  : t('paywall.billedYearlyPlain', { price: selected.priceString })
                : saving
                  ? t('paywall.billedMonthly', { percent: saving.percent })
                  : t('paywall.billedMonthlyPlain')}
            </Text>
          ) : null}

          {(['elite', 'pro'] as const).map((p) => {
            const price = catalog.plans[p][billing] ?? catalog.plans[p][billing === 'yearly' ? 'monthly' : 'yearly'];
            if (!price) return null;
            const current = tier === p;
            return (
              <PlanCard
                key={p}
                selected={plan === p}
                disabled={current}
                onPress={() => setPlanChoice(p)}
                badge={current ? t('paywall.currentPlan') : p === 'elite' ? t('paywall.coachPick') : undefined}
                name={planName(p)}
                sub={p === 'elite' ? t('paywall.eliteSub') : t('paywall.proSub')}
                price={`${price.priceString}${perSuffix(price)}`}
                perMonth={price.billing === 'yearly' ? t('paywall.perMonthApprox', { price: formatPrice(price.perMonth, price.currency, language) }) : t('paywall.billedMonthlyShort')}
                trial={!current && price.trialDays > 0 && purchases.isTrialEligible(price.productId) ? t('paywall.trialChip', { count: price.trialDays }) : null}
                features={
                  p === 'elite'
                    ? [t('paywall.eliteF1'), t('paywall.eliteF2'), t('paywall.eliteF3'), t('paywall.eliteF4')]
                    : [t('paywall.proF1'), t('paywall.proF2'), t('paywall.proF3'), t('paywall.proF4'), t('paywall.proF5')]
                }
              />
            );
          })}

          <View style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <StripItem value="150–400" label={t('paywall.strip1')} tone="accent" />
            <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
            <StripItem value="2" label={t('paywall.strip2')} />
            <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
            <StripItem value="4" label={t('paywall.strip3')} tone="violet" />
          </View>

          {selected ? (
            <Text variant="caption" tone="secondary" align="center">
              {trialDays
                ? t('paywall.termsTrial', { count: trialDays, price: selected.priceString, period: periodText(selected) })
                : t('paywall.termsPaid', { price: selected.priceString, period: periodText(selected) })}
            </Text>
          ) : null}
        </>
      )}

      <LegalLinks onRestore={restore} />
      <Disclaimer />
    </Screen>
  );
}

/** Sources with their own line under the title. */
const CONTEXT_SOURCES = ['onboarding', 'coach', 'first_checkin', 'second_slot', 'personality'] as const;
const hasContext = (s: PaywallSource | null): s is (typeof CONTEXT_SOURCES)[number] => !!s && (CONTEXT_SOURCES as readonly string[]).includes(s);

function PaywallHeader({ onRestore, restoring }: { onRestore?: () => void; restoring?: boolean }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Row style={[styles.header, { paddingTop: insets.top > 0 ? 0 : space[3] }]}>
      <IconButton icon={X} accessibilityLabel={t('common.close')} onPress={close} />
      {/* Subscriptions only (one-time purchases have no restore / cancel). */}
      {onRestore ? <Chip label={t('paywall.cancelAnytime')} icon={ShieldCheck} /> : null}
      {onRestore ? (
        <Pressable accessibilityRole="button" onPress={onRestore} hitSlop={10} disabled={restoring}>
          <Text variant="label" tone="secondary">
            {restoring ? t('common.loading') : t('paywall.restore')}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </Row>
  );
}

function PricesNotice({ mode, realPrices }: { mode: PurchasesMode; realPrices: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (realPrices || (mode !== 'preview' && mode !== 'unavailable')) return null;
  return (
    <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
      <Icon icon={Info} size={16} tone="accent" />
      <Text variant="bodySm" style={styles.flex}>
        {mode === 'preview' ? t('paywall.previewPrices') : t('paywall.unavailableNotice')}
      </Text>
    </View>
  );
}

function OnElite() {
  const { t } = useTranslation();
  const purchases = usePurchases();
  return (
    <Card variant="accent">
      <Row align="flex-start">
        <IconTile icon={CircleCheck} size={44} />
        <View style={styles.flex}>
          <Text variant="h2">{t('paywall.onEliteTitle')}</Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt4}>
            {t('paywall.onEliteBody')}
          </Text>
        </View>
      </Row>
      <Button label={t('paywall.manage')} variant="secondary" size="md" onPress={purchases.manage} style={styles.mt12} />
      <Button label={t('common.close')} variant="ghost" size="md" onPress={close} />
    </Card>
  );
}

function LegalLinks({ onRestore }: { onRestore?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Row style={styles.center} gap={space[3]}>
      {onRestore ? (
        <>
          <LinkText label={t('paywall.restorePurchases')} onPress={onRestore} />
          <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
        </>
      ) : null}
      <LinkText label={t('paywall.terms')} onPress={() => openLink(TERMS_URL)} />
      <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
      <LinkText label={t('paywall.privacy')} onPress={() => openLink(PRIVACY_URL)} />
    </Row>
  );
}

function PlanCard({
  selected,
  disabled,
  onPress,
  badge,
  name,
  sub,
  price,
  perMonth,
  trial,
  features,
}: {
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  badge?: string;
  name: string;
  sub: string;
  price: string;
  perMonth: string;
  trial: string | null;
  features: string[];
}) {
  const { colors } = useTheme();
  const haptics = useHaptics();
  const active = selected && !disabled;
  return (
    <Card
      variant={active ? 'accent' : 'default'}
      onPress={
        disabled
          ? undefined
          : () => {
              haptics('selection');
              onPress();
            }
      }
      accessibilityLabel={`${name} ${price}`}
      style={[active ? { borderWidth: 1.5, borderColor: colors.accent } : undefined, disabled && styles.dim]}>
      <Row style={styles.between}>
        <Row gap={space[2]} style={styles.shrink}>
          {badge ? <Chip label={badge} icon={CircleCheck} tone={disabled ? 'neutral' : 'solid'} /> : null}
          {trial ? <Chip label={trial} tone="accent" /> : null}
        </Row>
        {disabled ? null : (
          <View style={[styles.check, active ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.borderActive }]}>
            {active ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
          </View>
        )}
      </Row>
      <Row style={[styles.between, styles.mt12]} align="flex-start">
        <View style={styles.flex}>
          <Text variant="h2">{name.toUpperCase()}</Text>
          <Text variant="bodySm" tone="secondary">
            {sub}
          </Text>
        </View>
        <View style={styles.priceCol}>
          <Text variant="metricXl" tone={active ? 'accent' : 'primary'} style={styles.price}>
            {price}
          </Text>
          <Text variant="caption" tone="secondary">
            {perMonth}
          </Text>
        </View>
      </Row>
      <Divider style={styles.divider} />
      <View style={styles.features}>
        {features.map((f, i) => (
          <Row key={f} gap={space[3]} align="flex-start">
            <Icon icon={i === 0 ? Zap : Check} size={16} tone="accent" strokeWidth={2} />
            <Text variant="body" weight={i === 0 ? 'semibold' : 'regular'} style={styles.flex}>
              {f}
            </Text>
          </Row>
        ))}
      </View>
    </Card>
  );
}

function StripItem({ value, label, tone = 'primary' }: { value: string; label: string; tone?: 'primary' | 'accent' | 'violet' }) {
  return (
    <View style={styles.stripItem}>
      <Text variant="metricLg" tone={tone}>
        {value}
      </Text>
      <Text variant="label" tone="secondary" align="center" style={styles.stripLabel}>
        {label}
      </Text>
    </View>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* One-time purchases: Fast Pivot, 100 messages                        */
/* ------------------------------------------------------------------ */

function OneTimePaywall({ item }: { item: OneTimeItem }) {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const haptics = useHaptics();
  const purchases = usePurchases();
  const account = useAccount();
  const tier = useTier();
  const main = useActiveHustle(1);
  const failureText = useFailureText();
  const [busy, setBusy] = useState(false);

  const price = purchases.oneTime[item];
  const pivot = item === 'fast_pivot';
  const credits = account.fastPivotCredits;
  const needsPlan = !pivot && tier === 'free';
  const canPivotNow = pivot && credits > 0 && main.isCommitted && main.locked;

  const bullets: { icon: LucideIcon; text: string }[] = pivot
    ? [
        { icon: CircleCheck, text: t('paywall.pivotB1') },
        { icon: CircleCheck, text: t('paywall.pivotB2') },
        { icon: CircleCheck, text: t('paywall.pivotB3') },
      ]
    : [
        { icon: CircleCheck, text: t('paywall.messagesB1') },
        { icon: CircleCheck, text: t('paywall.messagesB2') },
        { icon: CircleCheck, text: t('paywall.messagesB3') },
      ];

  const pivotNow = () => {
    Alert.alert(t('machine.pivotConfirmTitle'), t('machine.pivotConfirmBody', { name: l(main.hustle.name) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('machine.pivotUse'),
        style: 'destructive',
        onPress: async () => {
          const result = await account.activateFastPivot(1);
          if (!result.ok) {
            haptics('error');
            Alert.alert(result.error === 'offline' ? t('common.offline') : t('machine.pivotError'));
            return;
          }
          haptics('success');
          // Back to the machine (now unlocked). Anywhere else, the tabs send
          // a user without an active hustle to the machine automatically.
          close();
          Alert.alert(t('machine.pivotDoneTitle'), t('machine.pivotDoneBody'));
        },
      },
    ]);
  };

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    const result = await purchases.buyOneTime(item);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === 'cancelled') return;
      haptics('error');
      Alert.alert(result.reason === 'unavailable' ? t('paywall.unavailableTitle') : t('common.error'), failureText(result.reason) ?? '');
      return;
    }
    haptics('success');
    if (!result.confirmed) {
      Alert.alert(t('paywall.pendingTitle'), t('paywall.pendingBody'), [{ text: t('common.done'), onPress: close }]);
      return;
    }
    if (pivot) {
      // Stay here: the "Use it now" button appears.
      if (!(main.isCommitted && main.locked)) Alert.alert(t('paywall.pivotAddedTitle'), t('paywall.pivotAddedBody'), [{ text: t('common.done'), onPress: close }]);
      return;
    }
    Alert.alert(t('paywall.messagesAddedTitle', { count: MESSAGES_PACK }), t('paywall.messagesAddedBody'), [{ text: t('common.continue'), onPress: close }]);
  };

  return (
    <Screen
      header={<PaywallHeader />}
      gap={space[3]}
      footer={
        needsPlan ? (
          <Button label={t('paywall.seePlans')} iconRight={ArrowRight} onPress={() => router.replace({ pathname: '/paywall', params: { source: 'coach' } })} />
        ) : canPivotNow ? (
          <>
            <Button label={t('paywall.pivotUseNow')} icon={Zap} onPress={pivotNow} haptic="medium" />
            <Button label={t('paywall.later')} variant="ghost" size="md" onPress={close} />
          </>
        ) : (
          <>
            <Button
              label={pivot ? t('paywall.pivotBuy', { price: price.priceString }) : t('paywall.messagesBuy', { count: MESSAGES_PACK, price: price.priceString })}
              icon={pivot ? Zap : MessageSquare}
              onPress={buy}
              loading={busy}
              disabled={busy || purchases.loading}
              haptic="medium"
            />
            <Row gap={6} style={styles.center}>
              <Icon icon={Lock} size={12} tone="tertiary" />
              <Text variant="label" tone="tertiary">
                {t('paywall.secure')}
              </Text>
            </Row>
          </>
        )
      }>
      <Chip label={t('paywall.oneTimeKicker')} icon={pivot ? Zap : MessageSquare} tone="amber" style={styles.center} />
      <View style={styles.oneTimeIcon}>
        <IconTile icon={pivot ? Zap : MessageSquare} tone="amber" size={64} />
      </View>
      <Text variant="h1" align="center">
        {pivot ? t('paywall.pivotTitle') : t('paywall.messagesTitle', { count: MESSAGES_PACK })}
      </Text>
      <Text variant="body" tone="secondary" align="center">
        {pivot ? t('paywall.pivotBody') : t('paywall.messagesBody')}
      </Text>

      <PricesNotice mode={purchases.mode} realPrices={purchases.realPrices} />

      <Card>
        <View style={styles.features}>
          {bullets.map((b) => (
            <Row key={b.text} gap={space[3]} align="flex-start">
              <Icon icon={b.icon} size={16} tone="accent" strokeWidth={2} />
              <Text variant="body" style={styles.flex}>
                {b.text}
              </Text>
            </Row>
          ))}
        </View>
        <Divider style={styles.divider} />
        <Row style={styles.between}>
          <Text variant="label" tone="secondary">
            {t('paywall.oneTimeKicker')}
          </Text>
          {purchases.loading ? <ActivityIndicator color={colors.accent} /> : <Text variant="metricLg">{price.priceString}</Text>}
        </Row>
      </Card>

      {pivot && credits > 0 ? (
        <Card variant="accent" padding={space[4]}>
          <Row gap={space[2]}>
            <Icon icon={CircleCheck} size={18} tone="accent" />
            <Text variant="body" weight="semibold" style={styles.flex}>
              {t('paywall.pivotOwned', { count: credits })}
            </Text>
          </Row>
          {canPivotNow ? (
            <Text variant="bodySm" tone="secondary" style={styles.mt4}>
              {t('paywall.pivotReadyBody', { name: l(main.hustle.name) })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {needsPlan ? (
        <Text variant="bodySm" tone="amber" align="center">
          {t('paywall.messagesNeedPlan')}
        </Text>
      ) : null}

      <Text variant="caption" tone="secondary" align="center">
        {t('paywall.oneTimeNote')}
      </Text>
      <LegalLinks />
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingBottom: space[2],
  },
  headerSpacer: {
    width: 44,
  },
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
  dim: {
    opacity: 0.6,
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
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  price: {
    fontSize: 24,
    lineHeight: 30,
  },
  divider: {
    marginVertical: space[4],
  },
  features: {
    gap: space[3],
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: space[4],
    paddingHorizontal: space[2],
    marginTop: space[2],
  },
  stripItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stripLabel: {
    fontSize: 10,
  },
  vsep: {
    width: 1,
    height: 28,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
  },
  oneTimeIcon: {
    alignItems: 'center',
    marginTop: space[2],
  },
});
