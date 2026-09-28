import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Check, Eye, Lightbulb, Link, Share2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, PixelRatio, Platform, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/LogoMark';
import { Screen } from '@/components/Screen';
import { StoryCard, type StoryData, type StoryType } from '@/components/share/StoryCard';
import { Button, Chip, Icon, IconButton, ListRow, Row, Segmented, Text, Toggle } from '@/components/ui';
import { inviteUrl } from '@/config';
import { BADGES } from '@/data/badges';
import { GOAL_TARGET_USD } from '@/data/quiz';
import { track } from '@/lib/analytics';
import { useHaptics } from '@/lib/haptics';
import { useAccount } from '@/state/AccountProvider';
import { useActiveHustle, useMoney, useProgress, useQuiz } from '@/state/hooks';
import { useHustles } from '@/state/HustlesProvider';
import { useProgressData } from '@/state/ProgressProvider';
import { ThemeScope } from '@/theme/ThemeProvider';
import { GUTTER, space } from '@/theme/tokens';

const TYPES: StoryType[] = ['machine', 'rank', 'badge', 'earnings'];
const TARGET_WIDTH_PX = 1080;
const TARGET_HEIGHT_PX = 1920;

/**
 * Story cards: "The machine chose", rank up, badge, first earnings.
 * The card is captured as a 1080×1920 image and handed to the system share
 * sheet. Amounts only appear when "Show amount" is on.
 */
export default function ShareScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ type?: string; hustle?: string; badge?: string }>();
  const { profile } = useAccount();
  const { byId } = useHustles();
  const { userBadges, checkins } = useProgressData();
  const active = useActiveHustle();
  const money = useMoney();
  const quiz = useQuiz();
  const progress = useProgress();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardRef = useRef<View>(null);

  const initialType = TYPES.includes(params.type as StoryType) ? (params.type as StoryType) : 'machine';
  const [type, setType] = useState<StoryType>(initialType);
  const [showAmount, setShowAmount] = useState(false);
  const earnedAt = new Map(userBadges.map((b) => [b.badge_id, b.earned_at]));
  const unlocked = BADGES.filter((b) => earnedAt.has(b.id));
  const [badgeKey, setBadgeKey] = useState<string | null>(params.badge ?? unlocked[unlocked.length - 1]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const hustle = byId(params.hustle) ?? active.hustle;
  const format = (n: number) => money.format(n, { decimals: 0 });
  const rankKey = profile?.rank ?? 'rookie';
  const badge = unlocked.find((b) => b.id === badgeKey) ?? unlocked[unlocked.length - 1];
  const dayOf = (iso: string | undefined) =>
    iso ? Math.max(1, Math.floor((new Date(iso).getTime() - active.startedAt.getTime()) / 86_400_000) + 1) : active.dayNumber;
  const firstSale = [...checkins].sort((a, b) => a.created_at.localeCompare(b.created_at)).find((c) => Number(c.revenue) > 0);
  const referralCode = profile?.referral_code ?? null;
  const link = inviteUrl(referralCode);
  const cardWidth = Math.min(width - GUTTER * 2, 360);

  const data: StoryData = {
    type,
    hustle,
    day: type === 'machine' && params.hustle ? 1 : type === 'earnings' && firstSale ? dayOf(firstSale.created_at) : active.dayNumber,
    showAmount,
    goal: quiz ? `${format(money.fromUsd(GOAL_TARGET_USD[quiz.incomeGoal]))}${t('common.perMonth')}` : null,
    netProfit: format(money.allTime),
    firstEarnings: format(firstSale ? money.amounts(firstSale).revenue : 0),
    rankName: t(`ranks.${rankKey}`),
    level: progress.level,
    streak: progress.streak,
    badge: badge
      ? { icon: badge.icon, title: t(`badges.${badge.id}.title`), body: t(`badges.${badge.id}.body`), day: dayOf(earnedAt.get(badge.id)) }
      : null,
    referralCode,
    inviteUrl: link,
  };

  const message = t('share.inviteMessage', { url: link });

  const shareImage = async () => {
    if (busy) return;
    if (Platform.OS === 'web') {
      Alert.alert(t('share.webNotice'));
      Share.share({ message })
        .then((r) => {
          if (r.action === Share.sharedAction) track('share_completed', { type, method: 'link' });
        })
        .catch(() => {});
      return;
    }
    setBusy(true);
    try {
      // captureRef sizes are in points; divide by the pixel ratio to get exactly 1080×1920 px.
      const ratio = PixelRatio.get();
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: TARGET_WIDTH_PX / ratio,
        height: TARGET_HEIGHT_PX / ratio,
      });
      haptics('success');
      track('share_card_created', { type, show_amount: showAmount });
      if (await Sharing.isAvailableAsync()) {
        // Resolves when the share sheet closes (iOS doesn't say where it went).
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('share.title') });
        track('share_completed', { type, method: 'image' });
      } else {
        const r = await Share.share({ url: uri, message });
        if (r.action === Share.sharedAction) track('share_completed', { type, method: 'image' });
      }
    } catch {
      haptics('error');
      Alert.alert(t('share.failed'));
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    await Clipboard.setStringAsync(link).catch(() => {});
    track('share_completed', { type, method: 'invite_link_copied' });
    haptics('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const header = (
    <Row style={[styles.header, { paddingTop: insets.top > 0 ? 0 : space[3] }]}>
      <IconButton icon={X} accessibilityLabel={t('common.close')} onPress={() => router.back()} />
      <LogoMark size={36} />
      <Text variant="h3" style={styles.flex}>
        {t('share.title')}
      </Text>
    </Row>
  );

  return (
    <Screen header={header} gap={space[4]}>
      <Segmented<StoryType>
        value={type}
        onChange={setType}
        size="sm"
        options={[
          { value: 'machine', label: t('share.typeMachine') },
          { value: 'rank', label: t('share.typeRank') },
          { value: 'badge', label: t('share.typeBadge') },
          { value: 'earnings', label: t('share.typeEarnings') },
        ]}
      />

      {type === 'badge' && unlocked.length > 1 ? (
        <View style={styles.chips}>
          {unlocked.map((b) => (
            <Chip key={b.id} label={t(`badges.${b.id}.title`)} caps={false} selected={b.id === badge?.id} onPress={() => setBadgeKey(b.id)} />
          ))}
        </View>
      ) : null}

      {type !== 'badge' ? (
        <ListRow
          icon={Eye}
          title={t('share.showAmount')}
          sub={t('share.showAmountHint')}
          right={<Toggle value={showAmount} onChange={setShowAmount} accessibilityLabel={t('share.showAmount')} />}
        />
      ) : null}

      <View style={styles.cardWrap}>
        <ThemeScope scheme="dark">
          <StoryCard ref={cardRef} width={cardWidth} data={data} />
        </ThemeScope>
      </View>

      <Button label={busy ? t('share.preparing') : t('share.shareImage')} icon={Share2} onPress={shareImage} loading={busy} haptic={null} />
      <Button label={copied ? t('share.copied') : t('share.copyInvite')} icon={copied ? Check : Link} variant="secondary" size="md" onPress={copyInvite} />
      <Row gap={6} style={styles.centerSelf}>
        <Icon icon={Lightbulb} size={14} />
        <Text variant="caption" tone="secondary" style={styles.shrink}>
          {t('share.hint')}
        </Text>
      </Row>
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
  header: {
    gap: space[3],
    paddingHorizontal: GUTTER,
    paddingBottom: space[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  cardWrap: {
    alignItems: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
});
