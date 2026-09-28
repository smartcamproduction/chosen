import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import {
  Brain,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleAlert,
  ImagePlus,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ProgressRing } from '@/components/Charts';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, EmptyState, Icon, IconButton, IconTile, ProgressBar, Row, Text } from '@/components/ui';
import { COACH_THREAD, TEASER, type ChatMessage } from '@/data/mock';
import { useLanguage } from '@/i18n/LanguageProvider';
import { daysUntilReset } from '@/lib/ai';
import { pickScreenshots, type PickedImage } from '@/lib/checkin';
import { formatPercent, formatTime } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { openOneTimePurchase, openPaywall, openPaywallOncePerSession } from '@/lib/paywall';
import { formatPrice, yearlySavings } from '@/lib/plans';
import { useAccount } from '@/state/AccountProvider';
import { isPremium } from '@/state/AppState';
import { useActiveHustle, useCoachPersonality, useTier } from '@/state/hooks';
import { usePurchases } from '@/state/PurchasesProvider';
import { useCoach, type ChatItem } from '@/state/useCoach';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, GUTTER, radius, space } from '@/theme/tokens';

const MAX_IMAGES = 3;

export default function Coach() {
  const premium = isPremium(useTier());

  // A Free user opens Coach → the paywall slides up (once per app session).
  useFocusEffect(
    useCallback(() => {
      if (premium) return;
      const timer = setTimeout(() => openPaywallOncePerSession('coach'), 450);
      return () => clearTimeout(timer);
    }, [premium]),
  );

  return premium ? <CoachChat /> : <CoachTeaser />;
}

/* ------------------------------------------------------------------ */
/* Pro / Elite: the AI coach                                           */
/* ------------------------------------------------------------------ */

function CoachChat() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const account = useAccount();
  const tier = useTier();
  const personality = useCoachPersonality();
  const { hustle, dayNumber } = useActiveHustle();
  const haptics = useHaptics();
  const coach = useCoach();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);

  const preview = account.mode === 'preview';
  const serverTier = account.profile?.tier ?? 'free';
  const needsConsent = !preview && !account.profile?.ai_consent_at;
  const planMismatch = !preview && !needsConsent && serverTier === 'free';
  const styleName = t(`profile.styles.${tier === 'elite' ? personality : 'balanced'}.name`);
  const usage = coach.usage;
  const allowance = usage?.limit || (tier === 'elite' ? 400 : 150);
  const used = Math.min(usage?.used ?? 0, allowance);
  const bonus = usage?.bonus ?? 0;
  const canType = coach.canUse && !coach.limitReached;

  // Why the message box is locked (shown as its placeholder, and on tap).
  const lockedPlaceholder = preview
    ? t('coach.placeholderPreview')
    : needsConsent
      ? t('coach.placeholderConsent')
      : planMismatch
        ? t('coach.planTitle')
        : coach.limitReached
          ? t('coach.limitTitle', { limit: usage?.limit ?? 0 })
          : t('coach.placeholderOff');
  const explainLocked = () => {
    if (preview) Alert.alert(t('coach.previewTitle'), t('coach.previewBody'));
    else if (needsConsent) Alert.alert(t('coach.consentTitle'), t('coach.consentBody'));
    else if (planMismatch) Alert.alert(t('coach.planTitle'), __DEV__ && tier !== serverTier ? t('coach.devPlanHint') : t('coach.planBody'));
    else if (coach.limitReached) Alert.alert(t('coach.limitTitle', { limit: usage?.limit ?? 0 }), t('coach.limitBody', { count: daysUntilReset() }));
    else Alert.alert(t('coach.placeholderOff'), t('coach.offBody'));
  };
  const messagesPrice = usePurchases().oneTime.messages.priceString;

  const messageCount = coach.messages.length;
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messageCount, coach.sending, coach.reviewing]);

  const submit = async (text: string) => {
    if (!canType || coach.sending || (!text.trim() && images.length === 0)) return;
    haptics('light');
    const sentImages = images;
    setDraft('');
    setImages([]);
    const ok = await coach.send(text, sentImages);
    if (ok) haptics('success');
  };

  const attach = async () => {
    try {
      const picked = await pickScreenshots(MAX_IMAGES - images.length);
      if (picked.length) setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
    } catch {
      Alert.alert(t('checkin.pickFailed'));
    }
  };

  const allowConsent = async () => {
    const result = await account.updateProfile({ ai_consent_at: new Date().toISOString() });
    if (!result.ok) Alert.alert(t('profile.saveFailed'));
  };

  const errorText =
    coach.lastError === 'ai_refused'
      ? t('coach.errorRefused')
      : coach.lastError === 'offline'
        ? t('common.offline')
        : coach.lastError === 'ai_not_configured'
          ? t('coach.errorNotConfigured')
          : coach.lastError && coach.lastError !== 'limit_reached'
            ? t('coach.errorBusy')
            : null;

  return (
    <Screen scroll={false} bottomInset={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Card padding={space[4]}>
            <Row style={styles.between}>
              <View style={styles.flex}>
                <Row gap={space[2]}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Text variant="label" tone="secondary">
                    {t('coach.sprint')}
                  </Text>
                </Row>
                <Text variant="h3" numberOfLines={1}>
                  {l(hustle.name)}
                </Text>
              </View>
              <View style={[styles.dayPill, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
                <ProgressRing value={Math.min(1, dayNumber / 30)} size={18} />
                <Text variant="metricMd">{dayNumber <= 30 ? t('common.dayShort', { day: dayNumber, total: 30 }) : t('today.dayOnly', { day: dayNumber })}</Text>
              </View>
            </Row>
          </Card>

          <Card padding={space[4]}>
            <Row align="flex-start">
              <View>
                <IconTile icon={Brain} size={48} />
                <View style={[styles.online, { backgroundColor: coach.canUse ? colors.accent : colors.textTertiary, borderColor: colors.surface }]} />
              </View>
              <View style={styles.flex}>
                <Text variant="h3">{styleName}</Text>
                <Text variant="caption" tone="secondary">
                  {t('coach.poweredBy')}
                </Text>
              </View>
              {tier === 'elite' ? <Chip label={t('tiers.elite')} tone="violet" /> : <Chip label={t('tiers.pro')} tone="accent" />}
            </Row>
            <View style={[styles.allowance, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
              <Row style={styles.between}>
                <Text variant="label" tone="secondary">
                  {t('coach.allowance')}
                </Text>
                <Text variant="metricMd">
                  {used} / {allowance}
                </Text>
              </Row>
              <ProgressBar value={allowance ? used / allowance : 0} segments={5} height={4} style={styles.mt8} tone={coach.limitReached ? 'amber' : 'accent'} />
              <Row style={[styles.between, styles.mt8]}>
                <Text variant="caption" tone="secondary">
                  {bonus
                    ? t('coach.usedWithBonus', { percent: formatPercent(used / allowance, language), bonus })
                    : t('coach.used', { percent: formatPercent(allowance ? used / allowance : 0, language) })}
                </Text>
                <Text variant="caption" tone="secondary">
                  {t('coach.resetsIn', { count: daysUntilReset() })}
                </Text>
              </Row>
            </View>
          </Card>

          {preview ? (
            <>
              <Card variant="highlight" padding={space[4]}>
                <Row gap={space[2]} align="flex-start">
                  <Icon icon={Sparkles} size={16} tone="accent" />
                  <View style={styles.flex}>
                    <Text variant="body" weight="semibold">
                      {t('coach.previewTitle')}
                    </Text>
                    <Text variant="bodySm" tone="secondary" style={styles.mt4}>
                      {t('coach.previewBody')}
                    </Text>
                  </View>
                </Row>
              </Card>
              {COACH_THREAD.map((m) => (
                <SampleMessage key={m.id} message={m} />
              ))}
            </>
          ) : needsConsent ? (
            <Card variant="accent">
              <Row align="flex-start">
                <IconTile icon={ShieldCheck} size={44} />
                <View style={styles.flex}>
                  <Text variant="h3">{t('coach.consentTitle')}</Text>
                  <Text variant="bodySm" tone="secondary" style={styles.mt4}>
                    {t('coach.consentBody')}
                  </Text>
                </View>
              </Row>
              <Button label={t('coach.consentCta')} icon={Check} onPress={allowConsent} style={styles.mt12} />
            </Card>
          ) : planMismatch ? (
            <Card>
              <EmptyState icon={Lock} title={t('coach.planTitle')} body={t('coach.planBody')} action={{ label: t('coach.teaser.seePlans'), onPress: () => openPaywall('coach') }} />
              {/* Development: the plan switch only changes screens, the server still says Free. */}
              {__DEV__ && tier !== serverTier ? (
                <Text variant="caption" tone="amber" align="center" style={styles.mt12}>
                  {t('coach.devPlanHint')}
                </Text>
              ) : null}
            </Card>
          ) : (
            <>
              <View style={[styles.syncPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Icon icon={Sparkles} size={13} tone="accent" />
                <Text variant="caption" tone="secondary">
                  {t('coach.contextPill')}
                </Text>
              </View>
              {coach.loaded && coach.messages.length === 0 ? <EmptyState icon={Sparkles} title={t('coach.emptyTitle')} body={t('coach.emptyBody')} /> : null}
              {coach.messages.map((m) => (
                <ChatBubble key={m.id} item={m} onRetry={() => coach.retry(m)} />
              ))}
              {coach.sending ? <Typing label={t('coach.typing')} /> : null}
              {coach.reviewing && !coach.sending ? <Typing label={t('coach.reviewing')} /> : null}
              {coach.limitReached ? (
                <Card variant="elevated" padding={space[4]}>
                  <Row align="flex-start">
                    <IconTile icon={MessageSquare} tone="amber" size={40} />
                    <View style={styles.flex}>
                      <Text variant="body" weight="semibold">
                        {t('coach.limitTitle', { limit: allowance })}
                      </Text>
                      <Text variant="bodySm" tone="secondary">
                        {t('coach.limitBody', { count: daysUntilReset() })}
                      </Text>
                    </View>
                  </Row>
                  <Button
                    label={t('coach.buyMore')}
                    sublabel={t('coach.buyMoreSub', { price: messagesPrice })}
                    icon={Zap}
                    size="md"
                    style={styles.mt12}
                    onPress={() => openOneTimePurchase('messages')}
                  />
                </Card>
              ) : null}
              {errorText ? <Notice icon={CircleAlert} text={errorText} tone="danger" onClose={coach.clearError} /> : null}
            </>
          )}
        </ScrollView>

        <View style={[styles.composerWrap, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          {canType ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              <Chip label={t('coach.quick1')} icon={Zap} caps={false} size="md" onPress={() => submit(t('coach.quick1'))} />
              <Chip label={t('coach.quick2')} icon={TrendingUp} caps={false} size="md" onPress={() => submit(t('coach.quick2'))} />
              <Chip label={t('coach.quick3')} icon={CalendarDays} caps={false} size="md" onPress={() => submit(t('coach.quick3'))} />
            </ScrollView>
          ) : null}
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
              {images.map((img, i) => (
                <View key={`${img.uri}-${i}`} style={[styles.thumb, { borderColor: colors.border }]}>
                  <Image source={{ uri: img.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <IconButton icon={X} size={24} accessibilityLabel={t('checkin.removeShot')} onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))} style={styles.thumbRemove} />
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.composer, { backgroundColor: colors.recessed, borderColor: colors.borderStrong }, !canType && styles.disabled]}>
            <IconButton
              icon={ImagePlus}
              variant="plain"
              size={36}
              accessibilityLabel={t('coach.attach')}
              tone="secondary"
              onPress={canType && images.length < MAX_IMAGES ? attach : undefined}
            />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              editable={canType}
              multiline
              maxLength={2000}
              placeholder={canType ? t('coach.placeholder') : lockedPlaceholder}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text }]}
              accessibilityLabel={t('coach.placeholder')}
            />
            <IconButton
              icon={Send}
              variant="accent"
              size={40}
              accessibilityLabel={t('coach.send')}
              onPress={() => submit(draft)}
              style={!canType || coach.sending || (!draft.trim() && !images.length) ? styles.disabled : undefined}
            />
            {/* Locked: tapping the box says why instead of doing nothing. */}
            {!canType ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={lockedPlaceholder}
                onPress={explainLocked}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
          <Row gap={6} style={styles.center}>
            <Icon icon={Lock} size={12} tone="tertiary" />
            <Text variant="caption" tone="tertiary" style={styles.shrink}>
              {t('coach.disclaimer')}
            </Text>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Notice({ icon, text, tone = 'accent', onClose }: { icon: typeof Sparkles; text: string; tone?: 'accent' | 'danger'; onClose?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.accentSoft, borderColor: tone === 'danger' ? colors.dangerBorder : colors.accentBorder }]}>
      <Icon icon={icon} size={16} tone={tone} />
      <Text variant="bodySm" style={styles.flex}>
        {text}
      </Text>
      {onClose ? <IconButton icon={X} variant="plain" size={28} accessibilityLabel={t('common.close')} onPress={onClose} /> : null}
    </View>
  );
}

function Typing({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.coachWrap}>
      <IconTile icon={SquareTerminal} size={28} />
      <View style={[styles.coachBubble, styles.typing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="bodySm" tone="secondary">
          {label}
        </Text>
      </View>
    </View>
  );
}

/** Coach text with simple formatting: **bold**, "- " bullets and "1." lists. */
function RichText({ text, color }: { text: string; color?: string }) {
  const lines = text.split('\n');
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <Text key={i} variant="body" weight="semibold" style={color ? { color } : undefined}>
          {part.slice(2, -2)}
        </Text>
      ) : (
        part
      ),
    );
  return (
    <View style={styles.rich}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={styles.gap} />;
        const bullet = line.match(/^\s*(?:[-•*]|(\d+)[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <Row key={i} gap={space[2]} align="flex-start">
              <Text variant="body" tone="accent" style={styles.bulletMark}>
                {bullet[1] ? `${bullet[1]}.` : '•'}
              </Text>
              <Text variant="body" style={[styles.flex, color ? { color } : undefined]}>
                {inline(bullet[2])}
              </Text>
            </Row>
          );
        }
        return (
          <Text key={i} variant="body" style={color ? { color } : undefined}>
            {inline(line.replace(/^#+\s*/, ''))}
          </Text>
        );
      })}
    </View>
  );
}

function ChatBubble({ item, onRetry }: { item: ChatItem; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const time = formatTime(new Date(item.created_at), language);

  if (item.kind === 'checkin') {
    return (
      <View style={[styles.syncPill, { backgroundColor: colors.violetSoft, borderColor: colors.violetBorder }]}>
        <Icon icon={CalendarCheck} size={13} tone="violet" />
        <Text variant="caption" tone="violet">
          {item.content} · {time}
        </Text>
      </View>
    );
  }

  if (item.role === 'user') {
    const shots = item.localImages?.length ?? item.image_paths?.length ?? 0;
    return (
      <Pressable style={styles.userWrap} disabled={item.status !== 'failed'} onPress={onRetry} accessibilityRole={item.status === 'failed' ? 'button' : undefined}>
        <Text variant="caption" tone={item.status === 'failed' ? 'danger' : 'secondary'} style={styles.metaRight}>
          {item.status === 'failed' ? t('coach.notSent') : item.status === 'sending' ? t('coach.sending') : `${time} · ${t('coach.you')}`}
        </Text>
        <View style={[styles.userBubble, { backgroundColor: colors.userBubble }, item.status === 'sending' && styles.dim]}>
          {item.content ? (
            <Text variant="body" style={{ color: colors.userBubbleText }}>
              {item.content}
            </Text>
          ) : null}
          {shots ? (
            <Row gap={6} style={item.content ? styles.mt8 : undefined}>
              <Icon icon={Paperclip} size={14} color={colors.userBubbleText} />
              <Text variant="caption" style={{ color: colors.userBubbleText }}>
                {t('coach.screenshots', { count: shots })}
              </Text>
            </Row>
          ) : null}
        </View>
        {item.status === 'failed' ? (
          <Row gap={4} style={styles.mt4}>
            <Icon icon={RotateCcw} size={12} tone="danger" />
            <Text variant="caption" tone="danger">
              {t('coach.retry')}
            </Text>
          </Row>
        ) : null}
      </Pressable>
    );
  }

  const label = item.kind === 'checkin_feedback' ? t('coach.feedbackLabel') : item.kind === 'nudge' ? t('coach.nudgeLabel') : t('coach.coachLabel');
  return (
    <View style={styles.coachWrap}>
      <IconTile icon={SquareTerminal} size={28} tone={item.kind === 'checkin_feedback' ? 'violet' : 'accent'} />
      <View style={styles.flex}>
        <Text variant="caption" tone="secondary" style={styles.meta}>
          {label} · {time}
        </Text>
        <View
          style={[
            styles.coachBubble,
            { backgroundColor: colors.surface, borderColor: item.kind === 'checkin_feedback' ? colors.violetBorder : colors.border },
          ]}>
          <RichText text={item.content} />
        </View>
      </View>
    </View>
  );
}

/** Sample messages shown in preview mode (no backend yet). */
function SampleMessage({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  if (message.from === 'user') {
    return (
      <View style={styles.userWrap}>
        <Text variant="caption" tone="secondary" style={styles.metaRight}>
          {message.time} · {t('coach.you')}
        </Text>
        <View style={[styles.userBubble, { backgroundColor: colors.userBubble }]}>
          <Text variant="body" style={{ color: colors.userBubbleText }}>
            {l(message.text)}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.coachWrap}>
      <IconTile icon={SquareTerminal} size={28} />
      <View style={styles.flex}>
        <Text variant="caption" tone="secondary" style={styles.meta}>
          {t('coach.coachLabel')} · {message.time}
        </Text>
        <View style={[styles.coachBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="body">{l(message.text)}</Text>
          {message.actions?.map((a, i) => (
            <Row key={i} gap={space[2]} align="flex-start">
              <Text variant="metricMd" tone="accent">
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text variant="bodySm" style={styles.flex}>
                {l(a)}
              </Text>
            </Row>
          ))}
          {message.outro ? <Text variant="body">{l(message.outro)}</Text> : null}
          {message.highlight ? (
            <Text variant="body" weight="semibold" tone="accent">
              {l(message.highlight)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Free: locked preview + upgrade                                      */
/* ------------------------------------------------------------------ */

function CoachTeaser() {
  const { t } = useTranslation();
  const l = useL();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const { catalog } = usePurchases();
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const monthly = catalog.plans.pro.monthly;
  const yearly = catalog.plans.pro.yearly;
  const saving = yearlySavings(catalog, 'pro');

  return (
    <Screen bottomInset={false} gap={space[4]}>
      <Card padding={space[4]}>
        <Row>
          <IconTile icon={SquareTerminal} size={44} />
          <View style={styles.flex}>
            <Text variant="h3">{t('coach.teaser.coachName')}</Text>
            <Text variant="caption" tone="secondary">
              {t('coach.teaser.coachSub')}
            </Text>
          </View>
          <Chip label={t('tiers.pro')} icon={Zap} tone="amber" />
        </Row>
      </Card>

      <View style={[styles.syncPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon icon={Lock} size={12} tone="secondary" />
        <Text variant="label" tone="secondary">
          {t('coach.teaser.sampleLabel')}
        </Text>
      </View>

      <View style={styles.coachWrap}>
        <IconTile icon={SquareTerminal} size={28} />
        <View style={[styles.coachBubble, styles.flex, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="body">{l(TEASER.coach)}</Text>
          <View style={[styles.swap, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
            <Text variant="label" tone="accent">
              {l(TEASER.blueprintLabel)}
            </Text>
            <Text variant="body" tone="secondary">
              {l(TEASER.blueprint)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.userWrap}>
        <View style={[styles.userBubble, { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border }]}>
          <Text variant="body">{l(TEASER.user)}</Text>
        </View>
      </View>

      <View style={styles.coachWrap}>
        <IconTile icon={SquareTerminal} size={28} />
        <View style={[styles.coachBubble, styles.flex, styles.blurHost, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="body">{l(TEASER.blurred)}</Text>
          <View style={[styles.swap, { backgroundColor: colors.recessed, borderColor: colors.border, height: 64 }]} />
          <BlurView intensity={Platform.OS === 'android' ? 0 : 20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'android' ? colors.surface : 'transparent', opacity: 0.92 }]} />
        </View>
      </View>

      <Card variant="accent">
        <Row align="flex-start">
          <IconTile icon={Lock} size={44} />
          <View style={styles.flex}>
            <Text variant="label" tone="accent">
              {t('coach.teaser.proFeature')}
            </Text>
            <Text variant="h2">{t('coach.teaser.title')}</Text>
          </View>
        </Row>

        <View style={styles.bullets}>
          {(['b1', 'b2', 'b3', 'b4'] as const).map((k) => (
            <Row key={k} gap={space[3]} align="flex-start">
              <Icon icon={Check} size={16} tone="accent" strokeWidth={2} />
              <Text variant="body" style={styles.flex}>
                {t(`coach.teaser.${k}`)}
              </Text>
            </Row>
          ))}
        </View>

        {monthly && yearly ? (
          <Row gap={space[2]} style={styles.mt16}>
            <PlanTile
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              label={t('coach.teaser.monthly')}
              price={monthly.priceString}
              unit={t('common.perMonth')}
            />
            <PlanTile
              selected={plan === 'yearly'}
              onPress={() => setPlan('yearly')}
              label={saving ? t('coach.teaser.save', { percent: saving.percent }) : t('paywall.yearly')}
              price={yearly.priceString}
              unit={t('coach.teaser.billedYearlyPer', { price: formatPrice(yearly.perMonth, yearly.currency, language) })}
              accent
            />
          </Row>
        ) : null}

        <Button label={t('coach.teaser.cta')} icon={Lock} onPress={() => openPaywall('coach', 'pro')} style={styles.mt16} haptic="medium" />
        <Button label={t('coach.teaser.seePlans')} icon={TrendingUp} variant="ghost" size="md" onPress={() => openPaywall('coach')} />
        <Text variant="caption" tone="tertiary" align="center">
          {t('coach.teaser.footer')}
        </Text>
      </Card>
    </Screen>
  );
}

function PlanTile({ selected, onPress, label, price, unit, accent }: { selected: boolean; onPress: () => void; label: string; price: string; unit: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card
      variant={selected ? 'elevated' : 'recessed'}
      padding={space[3]}
      radius={radius.md}
      onPress={onPress}
      style={[styles.flex, selected && { borderColor: colors.accentBorder }]}
      accessibilityLabel={`${label} ${price}`}>
      <Row style={styles.between}>
        <Text variant="label" tone={accent ? 'accent' : 'secondary'} numberOfLines={1} style={styles.shrink}>
          {label}
        </Text>
        <View style={[styles.radioDot, { backgroundColor: selected ? colors.accent : colors.chartMuted }]} />
      </Row>
      <Row gap={4} align="baseline" style={styles.mt8}>
        <Text variant="metricLg">{price}</Text>
      </Row>
      <Text variant="caption" tone="secondary">
        {unit}
      </Text>
    </Card>
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
    paddingHorizontal: space[2],
  },
  between: {
    justifyContent: 'space-between',
  },
  disabled: {
    opacity: 0.45,
  },
  dim: {
    opacity: 0.7,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  thread: {
    paddingHorizontal: GUTTER,
    paddingTop: space[4],
    paddingBottom: space[4],
    gap: space[3],
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: 6,
  },
  online: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  allowance: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    marginTop: space[4],
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: 6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  coachWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    paddingRight: space[6],
  },
  meta: {
    marginBottom: 4,
  },
  metaRight: {
    marginBottom: 4,
    alignSelf: 'flex-end',
  },
  coachBubble: {
    borderRadius: radius.lg,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  typing: {
    paddingVertical: space[3],
  },
  rich: {
    gap: 6,
  },
  gap: {
    height: 2,
  },
  bulletMark: {
    minWidth: 16,
  },
  swap: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    gap: 4,
  },
  userWrap: {
    alignItems: 'flex-end',
    paddingLeft: space[8],
  },
  userBubble: {
    borderRadius: radius.lg,
    borderTopRightRadius: 6,
    padding: space[4],
  },
  blurHost: {
    overflow: 'hidden',
  },
  composerWrap: {
    borderTopWidth: 1,
    paddingTop: space[2],
    paddingBottom: space[2],
    gap: space[2],
  },
  quick: {
    paddingHorizontal: GUTTER,
    gap: space[2],
  },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginHorizontal: GUTTER,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxHeight: 120,
  },
  bullets: {
    gap: space[3],
    marginTop: space[4],
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
