import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Brain,
  CalendarCheck,
  ChartColumn,
  Clock,
  Crown,
  Download,
  FileText,
  Flame,
  Link2,
  Lock,
  LogOut,
  Megaphone,
  RotateCcw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Vibrate,
  Volume2,
  Wrench,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { BottomSheet, Button, Card, Chip, Divider, Icon, IconTile, ListRow, ProgressBar, Row, SectionHeader, Segmented, Text, Toggle } from '@/components/ui';
import { deviceLanguage, type LanguagePreference } from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { CoachPersonality, ProfileUpdate, Tier } from '@/lib/database.types';
import { exportMyData } from '@/lib/exportData';
import { formatDate, formatMoney, formatNumber, type Currency } from '@/lib/format';
import { useL } from '@/lib/l10n';
import { enablePush, PUSH_TIMES, shortTime } from '@/lib/notifications';
import { openPaywall } from '@/lib/paywall';
import { useSoundsEnabled } from '@/lib/sounds';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { useActiveHustle, useCoachPersonality, useCurrency, useMoney, useProgress, useQuiz, useTier } from '@/state/hooks';
import { usePurchases } from '@/state/PurchasesProvider';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const COACH_STYLES: CoachPersonality[] = ['balanced', 'buddy', 'strict', 'consultant'];

export default function Profile() {
  const { t } = useTranslation();
  const l = useL();
  const { colors, preference: themePref, setPreference: setThemePref } = useTheme();
  const { language, preference: langPref, setPreference: setLangPref } = useLanguage();
  const { state, update, resetOnboarding } = useApp();
  const account = useAccount();
  const { profile } = account;
  const tier = useTier();
  const personality = useCoachPersonality();
  const currency = useCurrency();
  const quiz = useQuiz();
  const progress = useProgress();
  const { hustle, sprintDay } = useActiveHustle();
  const [timeSheet, setTimeSheet] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const purchases = usePurchases();

  const soundsOn = useSoundsEnabled();
  const net = useMoney().allTime;
  const name = profile?.display_name || account.email?.split('@')[0] || t('coach.you');
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const save = async (patch: ProfileUpdate) => {
    if (!account.signedIn) return;
    const result = await account.updateProfile(patch);
    if (!result.ok) Alert.alert(t('profile.saveFailed'));
  };

  const changeLanguage = (pref: LanguagePreference) => {
    setLangPref(pref);
    save({ locale: pref === 'system' ? deviceLanguage() : pref });
  };

  const changeCurrency = (next: Currency) => {
    update({ currency: next });
    save({ currency: next });
  };

  // Notifications. A push token lets the server reach this phone:
  //   daily coach message = token + notification_time
  //   offers & news       = token + promo_push_opt_in (separate opt-in)
  const preview = account.mode !== 'supabase';
  const token = profile?.expo_push_token ?? null;
  const dailyOn = !!profile?.notification_time && (preview || !!token);
  const promoOn = !!profile?.promo_push_opt_in && (preview || !!token);

  /** Makes sure this phone may receive pushes; returns the token (or false). */
  const ensurePush = async (): Promise<string | null | false> => {
    if (preview) {
      Alert.alert(t('profile.pushPreview'));
      return null;
    }
    if (token) return token;
    const result = await enablePush();
    if (result.ok) return result.token;
    Alert.alert(
      result.reason === 'denied'
        ? t('profile.pushDenied')
        : result.reason === 'no_project'
          ? t('profile.pushNoProject')
          : result.reason === 'unsupported'
            ? t('profile.pushWeb')
            : t('common.error'),
    );
    return false;
  };
  const toggleDaily = async (on: boolean) => {
    if (!on) {
      // Nothing left to send → forget the token too.
      save(promoOn ? { notification_time: null } : { notification_time: null, expo_push_token: null });
      return;
    }
    const pushToken = await ensurePush();
    if (pushToken === false) return;
    save({ notification_time: profile?.notification_time ?? '09:00:00', ...(pushToken ? { expo_push_token: pushToken } : {}) });
  };
  const togglePromo = async (on: boolean) => {
    if (!on) {
      save(dailyOn ? { promo_push_opt_in: false } : { promo_push_opt_in: false, expo_push_token: null });
      return;
    }
    const pushToken = await ensurePush();
    if (pushToken === false) return;
    save({ promo_push_opt_in: true, ...(pushToken ? { expo_push_token: pushToken } : {}) });
  };
  const pickTime = (time: string) => {
    setTimeSheet(false);
    save({ notification_time: `${time}:00` });
  };

  // Turning AI off disables the coach: say so first.
  const toggleAi = (on: boolean) => {
    if (on) {
      save({ ai_consent_at: new Date().toISOString() });
      return;
    }
    Alert.alert(t('profile.aiOffTitle'), t('profile.aiOffBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.aiOffConfirm'), style: 'destructive', onPress: () => save({ ai_consent_at: null }) },
    ]);
  };

  const exportData = async () => {
    if (!account.userId || exporting) return;
    setExporting(true);
    const result = await exportMyData({
      userId: account.userId,
      email: account.email,
      preview: account.preview?.data ?? null,
      shareTitle: t('profile.exportData'),
    });
    setExporting(false);
    if (!result.ok) Alert.alert(result.error === 'offline' ? t('common.offline') : t('profile.exportFailed'));
  };
  const openLegal = (doc: 'terms' | 'privacy' | 'ai' | 'affiliate') => router.push({ pathname: '/legal', params: { doc } });

  const pickStyle = (style: CoachPersonality) => {
    if (tier !== 'elite') {
      if (style !== 'balanced') openPaywall('personality', 'elite');
      return;
    }
    save({ coach_personality: style });
  };

  // Subscription: status from the server (RevenueCat), buttons via the store.
  const expires = profile?.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
  const product = profile?.subscription_product ?? '';
  const period = /year|annual/.test(product) ? 'yearly' : /month/.test(product) ? 'monthly' : null;
  const planTitle =
    tier === 'free'
      ? t('profile.planFree')
      : profile?.subscription_is_promo
        ? t('profile.planName', { plan: t(`tiers.${tier}`), period: t('profile.gift') })
        : period
          ? t('profile.planName', { plan: t(`tiers.${tier}`), period: t(period === 'yearly' ? 'profile.periodYearly' : 'profile.periodMonthly') })
          : t(`tiers.${tier}`);
  const planStatus =
    tier === 'free'
      ? t('profile.freeBody')
      : !expires || !profile || profile.tier !== tier
        ? t('profile.active')
        : profile.subscription_is_promo
          ? t('profile.giftEnds', { date: formatDate(expires, language, true) })
          : profile.subscription_is_trial
            ? t('profile.trialEnds', { date: formatDate(expires, language, true) })
            : profile.subscription_will_renew === false
              ? t('profile.endsOn', { date: formatDate(expires, language, true) })
              : t('profile.renews', { date: formatDate(expires, language, true) });
  const eliteYearly = purchases.catalog.plans.elite.yearly;

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    const result = await purchases.restore();
    setRestoring(false);
    if (!result.ok) {
      if (result.reason !== 'cancelled') Alert.alert(t('paywall.restoreFailed'), result.reason === 'unavailable' ? t('paywall.unavailableBody') : undefined);
      return;
    }
    if (result.tier === 'free') Alert.alert(t('paywall.restoreNothing'));
    else Alert.alert(t('paywall.restoredTitle'), t('paywall.restoredBody', { plan: t(`tiers.${result.tier}`) }));
  };

  const signOut = async () => {
    await account.signOut();
    resetOnboarding();
    router.replace('/welcome');
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await account.deleteAccount();
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(t('profile.deleteFailed'));
      return;
    }
    setConfirmDeleteOpen(false);
    resetOnboarding();
    router.replace('/welcome');
  };

  const tierChip =
    tier === 'elite' ? (
      <Chip label={t('tiers.elite')} icon={Crown} tone="amber" />
    ) : tier === 'pro' ? (
      <Chip label={t('tiers.pro')} icon={Sparkles} tone="accent" />
    ) : (
      <Chip label={t('tiers.free')} />
    );

  return (
    <Screen bottomInset={false} gap={space[3]}>
      {/* Account */}
      <Card>
        <Row>
          <View style={[styles.avatar, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
            <Text variant="h3" tone="accent">
              {initials}
            </Text>
          </View>
          <View style={styles.flex}>
            <Row gap={6}>
              <Text variant="h3" numberOfLines={1} style={styles.shrink}>
                {name}
              </Text>
              {account.signedIn ? <Icon icon={BadgeCheck} size={16} tone="accent" /> : null}
            </Row>
            <Text variant="bodySm" tone="secondary" numberOfLines={1}>
              {account.mode === 'preview' ? t('profile.previewAccount') : (account.email ?? '')}
            </Text>
          </View>
          {tierChip}
        </Row>
        <Divider style={styles.divider} />
        <Row style={styles.between}>
          <Text variant="label" tone="secondary">
            {t('profile.activeTrack')}
          </Text>
          <Text variant="metricMd" tone="accent">
            {formatNumber(progress.xp, language)} XP
          </Text>
        </Row>
        <Row style={[styles.between, styles.mt4]}>
          <Text variant="bodySm" style={styles.shrink} numberOfLines={1}>
            {t('common.dayOf', { day: sprintDay, total: 30 })} · {l(hustle.name)}
          </Text>
          <Text variant="monoSm" tone="secondary">
            {Math.round((sprintDay / 30) * 100)}%
          </Text>
        </Row>
        <ProgressBar value={sprintDay / 30} style={styles.mt8} />
        <Row style={styles.mt12}>
          <MiniTile icon={Flame} tone="amber" label={t('profile.streakLabel')} value={t('profile.streakValue', { count: progress.streak })} />
          <MiniTile
            icon={Banknote}
            tone="accent"
            label={t('profile.netLogged')}
            value={formatMoney(net, currency, language, { signed: true, decimals: 0 })}
            valueTone="accent"
          />
        </Row>
      </Card>

      {/* Subscription */}
      <SectionHeader label={t('profile.subscription')} right={tier !== 'free' ? t('profile.active') : undefined} rightTone="accent" style={styles.sectionGap} />
      <Card>
        <Row align="flex-start">
          <IconTile icon={tier === 'free' ? Lock : ShieldCheck} tone={tier === 'free' ? 'neutral' : 'accent'} />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              {planTitle}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {planStatus}
            </Text>
          </View>
          <Chip label={t('profile.current')} tone="accent" />
        </Row>

        {account.bonusMessages > 0 || account.fastPivotCredits > 0 ? (
          <Row gap={space[2]} style={[styles.mt12, styles.wrap]}>
            {account.bonusMessages > 0 ? <Chip label={t('profile.bonusMessages', { count: account.bonusMessages })} tone="accent" caps={false} /> : null}
            {account.fastPivotCredits > 0 ? <Chip label={t('machine.pivotAvailable', { count: account.fastPivotCredits })} tone="amber" caps={false} /> : null}
          </Row>
        ) : null}

        {tier !== 'elite' ? (
          <View style={[styles.upsell, { backgroundColor: colors.recessed, borderColor: colors.violetBorder }]}>
            <Row style={styles.between}>
              <Row gap={6}>
                <Icon icon={Sparkles} size={16} tone="violet" />
                <Text variant="label" tone="violet">
                  {tier === 'free' ? `${t('tiers.pro')} · ${t('tiers.elite')}` : t('tiers.elite')}
                </Text>
              </Row>
              {tier === 'pro' && eliteYearly ? (
                <Text variant="metricMd">
                  {eliteYearly.priceString}
                  {t('paywall.perYear')}
                </Text>
              ) : null}
            </Row>
            <Text variant="bodySm" tone="secondary">
              {tier === 'free' ? t('profile.freeUpsellBody') : t('profile.eliteUpsellBody')}
            </Text>
            <Button
              label={tier === 'free' ? t('profile.seePlans') : t('profile.upgradeElite')}
              iconRight={ArrowRight}
              size="md"
              onPress={() => openPaywall('profile', tier === 'pro' ? 'elite' : undefined)}
            />
          </View>
        ) : null}

        <Row style={styles.links}>
          <TextLink label={t('profile.manage')} onPress={purchases.manage} />
          <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
          <TextLink label={restoring ? t('common.loading') : t('profile.restore')} onPress={restore} />
        </Row>
      </Card>

      {/* Coach style */}
      <SectionHeader label={t('profile.coachStyle')} right={<Chip label={t('tiers.elite')} tone="violet" />} style={styles.sectionGap} />
      <Card padding={space[2]}>
        {COACH_STYLES.map((style, i) => {
          const selectable = tier === 'elite' || style === 'balanced';
          const active = (tier === 'elite' ? personality : 'balanced') === style && tier !== 'free';
          return (
            <Pressable
              key={style}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: !selectable }}
              onPress={() => pickStyle(style)}
              style={({ pressed }) => [styles.styleRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }, pressed && { opacity: 0.75 }]}>
              {selectable ? (
                <View style={[styles.radio, { borderColor: active ? colors.accent : colors.borderActive }]}>
                  {active ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
                </View>
              ) : (
                <Icon icon={Lock} size={18} tone="tertiary" />
              )}
              <View style={styles.flex}>
                <Row gap={space[2]}>
                  <Text variant="body" weight="semibold" tone={selectable ? 'primary' : 'secondary'}>
                    {t(`profile.styles.${style}.name`)}
                  </Text>
                  {active ? (
                    <Chip label={t('profile.styleActive')} tone="accent" />
                  ) : style !== 'balanced' ? (
                    <Chip label={t('tiers.elite')} tone="violet" />
                  ) : (
                    <Chip label={t('tiers.pro')} />
                  )}
                </Row>
                <Text variant="bodySm" tone="secondary" style={styles.mt4}>
                  {t(`profile.styles.${style}.body`)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {tier !== 'elite' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openPaywall('personality', 'elite')}
            style={[styles.unlockRow, { backgroundColor: colors.violetSoft, borderColor: colors.violetBorder }]}>
            <Icon icon={Brain} size={16} tone="violet" />
            <Text variant="bodySm" tone="violet" style={styles.flex}>
              {t('profile.unlockStyles')}
            </Text>
            <Text variant="label" tone="violet">
              {t('common.unlock')}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {/* Notifications: the daily coach message (with check-in nudges) and, separately, offers */}
      <SectionHeader label={t('profile.notifications')} style={styles.sectionGap} />
      <Card padding={space[4]}>
        <ListRow
          icon={Clock}
          title={t('profile.dailyBriefing')}
          sub={t('profile.dailyBriefingSub')}
          right={
            <Row gap={space[2]}>
              <Chip
                label={shortTime(profile?.notification_time)}
                caps={false}
                onPress={() => setTimeSheet(true)}
              />
              <Toggle value={dailyOn} onChange={toggleDaily} accessibilityLabel={t('profile.dailyBriefing')} />
            </Row>
          }
        />
        <Row gap={space[2]} align="flex-start" style={styles.nudgeNote}>
          <Icon icon={CalendarCheck} size={14} tone="tertiary" />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {t('profile.nudgeNote')}
          </Text>
        </Row>
        <ListRow
          divider
          icon={Megaphone}
          title={t('profile.promoPush')}
          sub={t('profile.promoPushSub')}
          right={<Toggle value={promoOn} onChange={togglePromo} accessibilityLabel={t('profile.promoPush')} />}
        />
      </Card>

      {/* Language & display */}
      <SectionHeader label={t('profile.languageDisplay')} style={styles.sectionGap} />
      <Card padding={space[4]}>
        <Text variant="body" weight="medium" style={styles.fieldLabel}>
          {t('profile.language')}
        </Text>
        <Segmented<LanguagePreference>
          value={langPref}
          onChange={changeLanguage}
          options={[
            { value: 'system', label: t('profile.system') },
            { value: 'en', label: t('profile.english') },
            { value: 'pl', label: t('profile.polish') },
          ]}
        />
        <Text variant="body" weight="medium" style={[styles.fieldLabel, styles.mt16]}>
          {t('profile.appearance')}
        </Text>
        <Segmented<ThemePreference>
          value={themePref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: t('profile.system') },
            { value: 'dark', label: t('profile.dark') },
            { value: 'light', label: t('profile.light') },
          ]}
        />
        <Text variant="body" weight="medium" style={[styles.fieldLabel, styles.mt16]}>
          {t('profile.currency')}
        </Text>
        <Segmented<Currency>
          size="sm"
          value={currency}
          onChange={changeCurrency}
          options={[
            { value: 'USD', label: 'USD $' },
            { value: 'EUR', label: 'EUR €' },
            { value: 'PLN', label: 'PLN zł' },
            { value: 'GBP', label: 'GBP £' },
          ]}
        />
        <View style={styles.mt8}>
          {account.signedIn && quiz ? (
            <ListRow
              icon={SlidersHorizontal}
              title={t('profile.myAnswers')}
              sub={t('profile.myAnswersSub')}
              chevron
              onPress={() => router.push({ pathname: '/quiz/[step]', params: { step: '1', edit: '1' } })}
            />
          ) : null}
          <ListRow
            divider={account.signedIn && !!quiz}
            icon={Vibrate}
            title={t('profile.haptics')}
            sub={t('profile.hapticsSub')}
            right={<Toggle value={state.haptics} onChange={(haptics) => update({ haptics })} accessibilityLabel={t('profile.haptics')} />}
          />
          <ListRow
            divider
            icon={Volume2}
            title={t('profile.sounds')}
            sub={t('profile.soundsSub')}
            right={
              <Toggle
                value={soundsOn}
                onChange={(on) => {
                  update({ sounds: on });
                  save({ sounds_enabled: on });
                }}
                accessibilityLabel={t('profile.sounds')}
              />
            }
          />
        </View>
      </Card>

      {/* Privacy & legal */}
      <SectionHeader label={t('profile.privacyLegal')} style={styles.sectionGap} />
      <Card padding={space[4]}>
        <ListRow
          icon={Brain}
          title={t('profile.aiSharing')}
          sub={t('profile.aiSharingSub')}
          right={
            <Toggle value={!!profile?.ai_consent_at} onChange={toggleAi} accessibilityLabel={t('profile.aiSharing')} />
          }
        />
        <ListRow
          divider
          icon={ChartColumn}
          title={t('profile.analytics')}
          sub={t('profile.analyticsSub')}
          right={
            <Toggle
              value={profile?.analytics_consent ?? false}
              onChange={(on) => save({ analytics_consent: on })}
              accessibilityLabel={t('profile.analytics')}
            />
          }
        />
        <ListRow divider icon={Sparkles} title={t('profile.aiTransparency')} chevron onPress={() => openLegal('ai')} />
        <ListRow divider icon={FileText} title={t('profile.terms')} chevron onPress={() => openLegal('terms')} />
        <ListRow divider icon={Shield} title={t('profile.privacy')} chevron onPress={() => openLegal('privacy')} />
        <ListRow divider icon={Link2} title={t('profile.affiliate')} chevron onPress={() => openLegal('affiliate')} />
        {account.signedIn ? (
          <ListRow
            divider
            icon={Download}
            title={t('profile.exportData')}
            sub={t('profile.exportDataSub')}
            right={exporting ? <ActivityIndicator color={colors.accent} /> : <Chip label="JSON" />}
            onPress={exportData}
          />
        ) : null}
      </Card>

      {/* Account actions */}
      {account.signedIn ? (
        <>
          <SectionHeader label={t('profile.account')} style={styles.sectionGap} />
          <Card padding={space[4]}>
            {account.email ? (
              <Text variant="bodySm" tone="secondary" style={styles.accountEmail}>
                {t('profile.signedInAs', { email: account.email })}
              </Text>
            ) : null}
            <Button label={t('profile.signOut')} icon={LogOut} variant="secondary" size="md" onPress={signOut} />
          </Card>

          <SectionHeader label={t('profile.danger')} style={styles.sectionGap} />
          <Card padding={space[4]} style={{ borderColor: colors.dangerBorder }}>
            <Button
              label={t('profile.deleteAccount')}
              icon={Trash2}
              variant="danger"
              size="md"
              onPress={() => {
                setDeleteError(null);
                setConfirmDeleteOpen(true);
              }}
            />
            <Text variant="caption" tone="secondary" align="center" style={styles.dangerNote}>
              {t('profile.deleteAccountSub')}
            </Text>
          </Card>
        </>
      ) : null}

      {/* Admins only (profiles.is_admin on the server) */}
      {profile?.is_admin && account.mode === 'supabase' ? (
        <>
          <SectionHeader label={t('admin.section')} style={styles.sectionGap} />
          <Card padding={space[4]}>
            <ListRow icon={Wrench} title={t('admin.title')} sub={t('admin.entrySub')} chevron onPress={() => router.push('/admin')} />
          </Card>
        </>
      ) : null}

      {/* Developer preview (never shown in App Store builds) */}
      {__DEV__ ? (
        <Card variant="ghost" padding={space[4]} style={{ borderColor: colors.amberBorder, borderStyle: 'dashed' }}>
          <Row gap={space[2]}>
            <Icon icon={Wrench} size={16} tone="amber" />
            <Text variant="label" tone="amber">
              {t('profile.dev.title')}
            </Text>
          </Row>
          <Text variant="caption" tone="secondary" style={styles.mt4}>
            {t('profile.dev.body')}
          </Text>
          <Text variant="body" weight="medium" style={[styles.fieldLabel, styles.mt12]}>
            {t('profile.dev.tier')}
          </Text>
          <Segmented<Tier>
            value={tier}
            onChange={(devTier) => update({ devTier })}
            options={[
              { value: 'free', label: t('tiers.free') },
              { value: 'pro', label: t('tiers.pro') },
              { value: 'elite', label: t('tiers.elite') },
            ]}
          />
          <Text variant="caption" tone="tertiary" style={styles.mt4}>
            {t('profile.dev.tierNote')}
          </Text>
          <View style={styles.devButtons}>
            <Button label={t('profile.dev.checkin')} variant="secondary" size="sm" onPress={() => router.push('/check-in')} />
            <Button label={t('profile.dev.machine')} variant="secondary" size="sm" onPress={() => router.push('/machine')} />
            <Button label={t('profile.dev.paywall')} variant="secondary" size="sm" onPress={() => openPaywall('dev')} />
            <Button
              label={t('profile.dev.celebration')}
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: '/celebration', params: { kind: 'rank', from: 'earner', to: 'operator' } })}
            />
            <Button label={t('profile.dev.share')} variant="secondary" size="sm" onPress={() => router.push('/share')} />
            {account.previewTools ? (
              <>
                <Button label={t('profile.dev.addPivot')} variant="secondary" size="sm" onPress={account.previewTools.addFastPivotCredit} />
                <Button label={t('profile.dev.endLock')} variant="secondary" size="sm" onPress={account.previewTools.endCommitmentNow} />
                <Button label={t('profile.dev.skipWeek')} variant="secondary" size="sm" onPress={account.previewTools.skipWeek} />
              </>
            ) : null}
            <Button label={t('profile.dev.replay')} variant="secondary" size="sm" icon={RotateCcw} onPress={signOut} />
          </View>
        </Card>
      ) : null}

      <View style={styles.footer}>
        <Row gap={6}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text variant="monoSm" tone="secondary">
            {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
          </Text>
        </Row>
        <Text variant="caption" tone="tertiary">
          {t('profile.madeFor')}
        </Text>
      </View>

      <BottomSheet visible={timeSheet} onClose={() => setTimeSheet(false)} title={t('profile.pushTimeTitle')} subtitle={t('profile.pushTimeBody')}>
        <View style={styles.timeGrid}>
          {PUSH_TIMES.map((time) => (
            <Chip key={time} label={time} caps={false} size="md" selected={shortTime(profile?.notification_time) === time} onPress={() => pickTime(time)} />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={confirmDeleteOpen}
        onClose={() => !deleting && setConfirmDeleteOpen(false)}
        title={t('profile.confirmDeleteTitle')}
        subtitle={t('profile.deleteConfirmBody')}>
        <Text variant="bodySm" tone="amber">
          {t('profile.subscriptionNote')}
        </Text>
        {deleteError ? (
          <Text variant="bodySm" tone="danger" accessibilityRole="alert">
            {deleteError}
          </Text>
        ) : null}
        <Button
          label={deleting ? t('profile.deleting') : t('profile.deleteConfirmCta')}
          variant="danger"
          icon={Trash2}
          onPress={confirmDelete}
          loading={deleting}
          haptic="warning"
        />
        <Button label={t('common.cancel')} variant="ghost" size="md" onPress={() => setConfirmDeleteOpen(false)} disabled={deleting} />
      </BottomSheet>
    </Screen>
  );
}

function MiniTile({
  icon,
  tone,
  label,
  value,
  valueTone = 'primary',
}: {
  icon: typeof Flame;
  tone: 'amber' | 'accent';
  label: string;
  value: string;
  valueTone?: 'primary' | 'accent';
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.miniTile, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <Icon icon={icon} size={18} tone={tone} />
      <View style={styles.flex}>
        <Text variant="caption" tone="secondary" numberOfLines={2}>
          {label}
        </Text>
        <Text variant="body" weight="semibold" tone={valueTone} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text variant="bodySm" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  between: {
    justifyContent: 'space-between',
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
  sectionGap: {
    marginTop: space[3],
  },
  divider: {
    marginVertical: space[4],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
  },
  wrap: {
    flexWrap: 'wrap',
  },
  upsell: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
    marginTop: space[4],
  },
  links: {
    marginTop: space[4],
    gap: space[3],
  },
  vsep: {
    width: 1,
    height: 14,
  },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    padding: space[3],
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    margin: space[2],
  },
  fieldLabel: {
    marginBottom: space[2],
  },
  accountEmail: {
    marginBottom: space[3],
  },
  nudgeNote: {
    paddingLeft: space[1],
    paddingBottom: space[2],
  },
  dangerNote: {
    marginTop: space[2],
    marginBottom: space[3],
  },
  devButtons: {
    gap: space[2],
    marginTop: space[4],
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    marginTop: space[4],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
