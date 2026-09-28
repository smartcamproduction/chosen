import { Banknote, Zap, type LucideIcon } from 'lucide-react-native';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Emblem } from '@/components/Emblem';
import { LogoMark } from '@/components/LogoMark';
import { Chip, IconTile, Row, Text } from '@/components/ui';
import { difficultyLabel, type Hustle } from '@/data/hustles';
import { useL } from '@/lib/l10n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type StoryType = 'machine' | 'rank' | 'badge' | 'earnings';

export interface StoryData {
  type: StoryType;
  hustle: Hustle;
  day: number;
  showAmount: boolean;
  /** Pre-formatted amounts; only shown when showAmount is on. */
  goal: string | null;
  netProfit: string;
  firstEarnings: string;
  rankName: string;
  level: number;
  streak: number;
  badge: { icon: LucideIcon; title: string; body: string; day: number } | null;
  referralCode: string | null;
  inviteUrl: string;
}

/**
 * A 9:16 story card. It's rendered at phone size and captured at
 * 1080×1920 px by react-native-view-shot. Always uses the dark brand look.
 */
export function StoryCard({ width, data, ref }: { width: number; data: StoryData; ref?: Ref<View> }) {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const height = Math.round((width * 16) / 9);
  const qrSize = Math.round(width * 0.2);

  const tile = (label: string, value: string, tone: 'primary' | 'accent' = 'primary') => (
    <View style={[styles.tile, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <Text variant="label" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="metricMd" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width, height, backgroundColor: colors.bg, borderColor: colors.accentBorder }]}>
      {/* Header */}
      <Row style={styles.between} gap={space[2]}>
        <Row gap={space[2]} style={styles.shrink}>
          <LogoMark size={32} />
          <View style={styles.shrink}>
            <Text variant="body" weight="semibold" style={styles.tracked}>
              CHOSEN
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {t('share.tagline')}
            </Text>
          </View>
        </Row>
        <Chip label={t('share.sprint')} icon={Zap} tone="accent" style={styles.noShrink} />
      </Row>

      {/* Body */}
      <View style={styles.body}>
        {data.type === 'machine' ? (
          <>
            <View>
              <Emblem size={Math.round(width * 0.26)} animate={false} />
              <View style={[styles.dayTag, { backgroundColor: colors.accent }]}>
                <Text variant="label" tone="onAccent">
                  {data.day <= 30 ? t('share.dayOf', { day: data.day }) : t('share.dayOnly', { day: data.day })}
                </Text>
              </View>
            </View>
            <Chip label={t('share.machineChose')} dot tone="accent" style={styles.center} />
            <Text variant="h1" align="center" numberOfLines={3}>
              {l(data.hustle.name)}
            </Text>
            <Row gap={space[2]} style={styles.stretch}>
              {tile(t('share.commitment'), t('common.hPerWeek', { value: `${data.hustle.hours[0]}–${data.hustle.hours[1]}` }))}
              {tile(t('reveal.difficulty'), t(`difficulty.${difficultyLabel(data.hustle.difficulty)}`))}
              {data.showAmount && data.goal ? tile(t('share.goal'), data.goal, 'accent') : null}
            </Row>
            <Quote text={t('share.machineQuote')} />
          </>
        ) : null}

        {data.type === 'rank' ? (
          <>
            <Emblem size={Math.round(width * 0.28)} animate={false} />
            <Chip label={t('share.rankUp')} dot tone="accent" style={styles.center} />
            <Text variant="display" align="center">
              {data.rankName}
            </Text>
            <Text variant="body" tone="secondary" align="center">
              {t('share.level', { level: data.level })} · {t('share.streak', { count: data.streak })}
            </Text>
            {data.showAmount ? <Row style={styles.stretch}>{tile(t('share.netProfit'), data.netProfit, 'accent')}</Row> : null}
            <Quote text={t('share.rankQuote')} />
          </>
        ) : null}

        {data.type === 'badge' && data.badge ? (
          <>
            <IconTile icon={data.badge.icon} tone="amber" size={Math.round(width * 0.26)} />
            <Chip label={t('share.badgeUnlocked')} dot tone="accent" style={styles.center} />
            <Text variant="display" align="center" numberOfLines={2}>
              {data.badge.title}
            </Text>
            <Text variant="body" tone="secondary" align="center">
              {data.badge.body}
            </Text>
            <Text variant="label" tone="accent">
              {data.badge.day <= 30 ? t('share.dayOf', { day: data.badge.day }) : t('share.dayOnly', { day: data.badge.day })}
            </Text>
          </>
        ) : null}

        {data.type === 'earnings' ? (
          <>
            <IconTile icon={Banknote} tone="accent" size={Math.round(width * 0.24)} />
            <Chip label={t('share.firstEarnings')} dot tone="accent" style={styles.center} />
            {data.showAmount ? (
              <Text variant="metricXl" tone="accent" align="center" style={styles.bigAmount}>
                {data.firstEarnings}
              </Text>
            ) : (
              <Text variant="h1" align="center">
                {t('share.firstEarningsHidden')}
              </Text>
            )}
            <Text variant="body" tone="secondary" align="center">
              {l(data.hustle.name)}
            </Text>
            <Quote text={t('share.firstEarningsQuote', { day: data.day })} />
          </>
        ) : null}
      </View>

      {/* Invite */}
      <View style={[styles.invite, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
        <View style={styles.qr}>
          <QRCode value={data.inviteUrl} size={qrSize} color="#0E0F11" backgroundColor="#FFFFFF" quietZone={4} />
        </View>
        <View style={styles.flex}>
          <Text variant="body" weight="semibold">
            {t('share.scanToJoin')}
          </Text>
          {data.referralCode ? (
            <Text variant="monoSm" tone="accent">
              {t('share.code', { code: data.referralCode })}
            </Text>
          ) : null}
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {data.inviteUrl.replace(/^https?:\/\//, '')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Quote({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.quote, { backgroundColor: colors.recessed }]}>
      <Text variant="bodySm" align="center">
        “{text}”
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    padding: space[5],
    overflow: 'hidden',
  },
  between: {
    justifyContent: 'space-between',
  },
  shrink: {
    flexShrink: 1,
  },
  noShrink: {
    flexShrink: 0,
  },
  tracked: {
    letterSpacing: 2,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  center: {
    alignSelf: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
  },
  dayTag: {
    position: 'absolute',
    top: -8,
    right: -22,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    gap: 4,
  },
  quote: {
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  bigAmount: {
    fontSize: 44,
    lineHeight: 52,
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[3],
  },
  qr: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
});
