import { Clock, Gauge, Layers, Lock, RotateCcw, Share2, TrendingUp, Wallet, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Disclaimer } from '@/components/Disclaimer';
import { BottomSheet, Button, Chip, IconTile, Row, Text } from '@/components/ui';
import { difficultyLabel, type Hustle } from '@/data/hustles';
import { fitCheck } from '@/data/quiz';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { ChooseTarget } from '@/lib/commitment';
import { formatDate, formatMoney, pad2 } from '@/lib/format';
import { useL } from '@/lib/l10n';
import { useQuiz, useTier } from '@/state/hooks';
import { space } from '@/theme/tokens';

interface Props {
  visible: boolean;
  hustle: Hustle | null;
  target: ChooseTarget | null;
  fastPivotCredits: number;
  onClose: () => void;
  onChoose: () => void;
  onFastPivot: () => void;
  /** No Fast Pivot left: open the purchase screen. */
  onGetFastPivot: () => void;
  /** Not Elite yet: open the paywall for a second hustle slot. */
  onSecondSlot: () => void;
  onSpinAgain: () => void;
  onShare: () => void;
}

/** Slides up after a spin: what the machine picked, and what to do next. */
export function HustleResultSheet({
  visible,
  hustle,
  target,
  fastPivotCredits,
  onClose,
  onChoose,
  onFastPivot,
  onGetFastPivot,
  onSecondSlot,
  onSpinAgain,
  onShare,
}: Props) {
  const { t } = useTranslation();
  const l = useL();
  const { language } = useLanguage();
  const quiz = useQuiz();
  const tier = useTier();

  if (!hustle || !target) {
    return (
      <BottomSheet visible={false} onClose={onClose}>
        <View />
      </BottomSheet>
    );
  }

  const usd = (n: number) => formatMoney(n, 'USD', language, { decimals: 0 });
  const cost = hustle.startupCost[1] === 0 ? usd(0) : `${usd(hustle.startupCost[0])}–${usd(hustle.startupCost[1])}`;
  const fit = quiz ? fitCheck(hustle, quiz) : null;
  const canChoose = target.kind === 'free' || target.kind === 'replace';

  return (
    <BottomSheet visible={visible} onClose={onClose} scroll maxHeight={0.9}>
      <Row>
        <IconTile icon={hustle.icon} size={44} />
        <View style={styles.flex}>
          <Text variant="label" tone="accent">
            {t('result.kicker')}
          </Text>
          <Text variant="monoSm" tone="tertiary">
            #{pad2(hustle.number)}
          </Text>
        </View>
        {fit ? <Chip label={t('reveal.fits', { count: fit.score })} icon={Zap} tone="accent" /> : null}
      </Row>

      <Text variant="h1">{l(hustle.name)}</Text>
      <Text variant="body" tone="secondary">
        {l(hustle.summary)}
      </Text>

      <View style={styles.chips}>
        <Chip label={t('result.hoursChip', { hours: `${hustle.hours[0]}–${hustle.hours[1]}` })} icon={Clock} caps={false} size="md" />
        <Chip label={t('result.startChip', { cost })} icon={Wallet} caps={false} size="md" />
        {hustle.earningMonthly ? (
          <Chip
            label={t('result.earningsChip', { range: `${usd(hustle.earningMonthly[0])}–${usd(hustle.earningMonthly[1])}` })}
            icon={TrendingUp}
            tone="accent"
            caps={false}
            size="md"
          />
        ) : null}
        <Chip
          label={t('result.difficultyChip', { label: t(`difficulty.${difficultyLabel(hustle.difficulty)}`), level: hustle.difficulty })}
          icon={Gauge}
          caps={false}
          size="md"
        />
      </View>

      <Text variant="bodySm" tone="secondary">
        {l(hustle.earningRange)}
      </Text>
      <Text variant="caption" tone="tertiary">
        {t('result.earningsNote')}
      </Text>
      <Disclaimer style={styles.disclaimer} />

      <View style={styles.actions}>
        {target.kind === 'free' && target.slot === 2 ? (
          <Text variant="caption" tone="violet" align="center">
            {t('result.secondSlot')}
          </Text>
        ) : null}
        {target.kind === 'replace' ? (
          <Text variant="caption" tone="accent" align="center">
            {t('result.switchFree')}
          </Text>
        ) : null}

        <Button label={t('result.choose')} icon={canChoose ? undefined : Lock} onPress={onChoose} disabled={!canChoose} haptic="medium" />

        {target.kind === 'locked' ? (
          <>
            <Text variant="bodySm" tone="secondary" align="center">
              {t('result.committedUntil', { date: formatDate(target.until, language, true) })}
            </Text>
            <Button
              label={fastPivotCredits > 0 ? t('result.fastPivotUse', { count: fastPivotCredits }) : t('result.fastPivotGet')}
              icon={Zap}
              variant="accentOutline"
              size="md"
              onPress={fastPivotCredits > 0 ? onFastPivot : onGetFastPivot}
            />
            {tier !== 'elite' ? (
              <Button label={t('result.secondSlotElite')} icon={Layers} variant="ghost" size="md" onPress={onSecondSlot} />
            ) : null}
          </>
        ) : null}
        {target.kind === 'same' ? (
          <Text variant="bodySm" tone="secondary" align="center">
            {t('result.alreadyActive')}
          </Text>
        ) : null}

        <Row gap={space[2]}>
          <View style={styles.flex}>
            <Button label={t('result.spinAgain')} icon={RotateCcw} variant="secondary" size="md" onPress={onSpinAgain} />
          </View>
          <View style={styles.flex}>
            <Button label={t('result.share')} icon={Share2} variant="secondary" size="md" onPress={onShare} />
          </View>
        </Row>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  actions: {
    gap: space[2],
    marginTop: space[2],
  },
  disclaimer: {
    alignSelf: 'flex-start',
    textAlign: 'left',
  },
});
