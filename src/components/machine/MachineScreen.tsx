import { router, type Href } from 'expo-router';
import { ChevronRight, Layers, Lock, LockOpen, Repeat, SlidersHorizontal, Zap } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SlotReels } from '@/components/SlotReels';
import { BottomSheet, Button, Card, Chip, Divider, Icon, IconTile, ListRow, ProgressBar, Row, SectionHeader, Text } from '@/components/ui';
import { difficultyLabel, type Hustle } from '@/data/hustles';
import { useLanguage } from '@/i18n/LanguageProvider';
import { chooseTarget } from '@/lib/commitment';
import { formatDate, formatMoney, pad2 } from '@/lib/format';
import { track } from '@/lib/analytics';
import { useHaptics } from '@/lib/haptics';
import { useL } from '@/lib/l10n';
import { useMachine } from '@/lib/machine';
import { openOneTimePurchase, openPaywall } from '@/lib/paywall';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { useActiveHustle, useCurrency, useSpinLogger, useTier } from '@/state/hooks';
import { useHustles } from '@/state/HustlesProvider';
import { usePurchases } from '@/state/PurchasesProvider';
import { useAfterHustleChosen } from '@/state/usePaywallTriggers';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { CommitmentPanel } from './CommitmentPanel';
import { HustleResultSheet } from './HustleResultSheet';

type Sheet = 'none' | 'result' | 'commit';

/**
 * The slot machine. Used for the very first draw and, after committing,
 * for "fun spins" (choosing stays locked until the 30 days are over).
 */
export function MachineScreen({ header = 'minimal' }: { header?: 'minimal' | ReactNode }) {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { state, update } = useApp();
  const account = useAccount();
  const tier = useTier();
  const currency = useCurrency();
  const { hustles } = useHustles();
  const slot1 = useActiveHustle(1);
  const slot2 = useActiveHustle(2);
  const [now] = useState(() => Date.now());
  const [result, setResult] = useState<Hustle | null>(null);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [pivot, setPivot] = useState(false);
  const [pivoting, setPivoting] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const purchases = usePurchases();
  const haptics = useHaptics();
  const afterHustleChosen = useAfterHustleChosen();

  const logSpin = useSpinLogger();

  const committed = slot1.isCommitted;
  const funSpin = committed && slot1.locked;

  const machine = useMachine((hustle) => {
    update((prev) => ({ pendingHustleId: hustle.id, spinCount: prev.spinCount + 1 }));
    logSpin(hustle);
    track('spin_result', { hustle: hustle.slug, spin_number: state.spinCount + 1, fun_spin: funSpin });
    setResult(hustle);
    setPivot(false);
    setSheet('result');
  });

  const target = result ? chooseTarget(account.userHustles, tier, result.id, now) : null;
  const status = machine.phase === 'spinning' ? t('draw.spinning') : machine.phase === 'done' ? t('draw.drawn') : t('draw.idle');

  const spin = () => {
    if (machine.phase === 'spinning') return;
    track('spin', { signed_in: account.signedIn, fun_spin: funSpin, spin_number: state.spinCount + 1 });
    machine.spin();
  };

  const spinAgain = () => {
    setSheet('none');
    setTimeout(spin, 280);
  };

  const leaveTo = (route: Href) => {
    setSheet('none');
    router.push(route);
  };

  /** Close the sheet first, then open a screen (the sheet is a modal). */
  const afterSheet = (open: () => void) => {
    setSheet('none');
    setTimeout(open, 260);
  };

  // Fast Pivot: spend a credit to leave a locked hustle and choose again now.
  const confirmPivot = (slot: 1 | 2) => {
    const name = l((slot === 2 ? slot2 : slot1).hustle.name);
    Alert.alert(t('machine.pivotConfirmTitle'), t('machine.pivotConfirmBody', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('machine.pivotUse'),
        style: 'destructive',
        onPress: async () => {
          setPivoting(true);
          const outcome = await account.activateFastPivot(slot);
          setPivoting(false);
          if (!outcome.ok) {
            haptics('error');
            Alert.alert(
              outcome.error === 'offline' ? t('common.offline') : outcome.error === 'not_locked' ? t('machine.pivotNotNeeded') : t('machine.pivotError'),
            );
            return;
          }
          haptics('success');
          Alert.alert(t('machine.pivotDoneTitle'), t('machine.pivotDoneBody'));
        },
      },
    ]);
  };
  const startPivot = () => {
    const locked = [slot1, slot2].filter((s) => s.isCommitted && s.locked);
    if (locked.length < 2) {
      confirmPivot(1);
      return;
    }
    Alert.alert(t('machine.pivotWhich'), undefined, [
      ...locked.map((s) => ({ text: l(s.hustle.name), onPress: () => confirmPivot(s.userHustle?.slot === 2 ? 2 : 1) })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <Screen header={header} gap={space[4]}>
      {committed ? (
        <Card variant={slot1.locked ? 'default' : 'accent'}>
          <Row style={styles.between}>
            <Chip
              label={slot1.locked ? t('machine.lockTitle') : slot1.userHustle?.completed_at ? t('machine.completedTitle') : t('machine.unlockedTitle')}
              icon={slot1.locked ? Lock : LockOpen}
              tone="accent"
            />
            <Text variant="label" tone="accent">
              {t('common.dayOf', { day: slot1.sprintDay, total: 30 })}
            </Text>
          </Row>
          <Text variant="h2" style={styles.mt12}>
            {l(slot1.hustle.name)}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt4}>
            {slot1.locked
              ? `${t('machine.lockedUntil', { date: formatDate(slot1.lockUntil, language, true) })} · ${t('common.daysLeft', { count: slot1.daysLeft })}`
              : t('machine.unlockedBody', { name: l(slot1.hustle.name) })}
          </Text>
          <ProgressBar value={slot1.sprintDay / 30} style={styles.mt12} />
          {slot1.locked ? (
            <Text variant="bodySm" tone="secondary" style={styles.mt12}>
              {t('machine.funSpinsBody', { date: formatDate(slot1.lockUntil, language) })}
            </Text>
          ) : null}
          {tier === 'elite' ? (
            <Row gap={space[2]} style={styles.mt12}>
              <Icon icon={Layers} size={16} tone="violet" />
              <Text variant="bodySm" tone="violet" style={styles.flex}>
                {slot2.isCommitted ? t('machine.slot2Active', { name: l(slot2.hustle.name) }) : t('machine.slot2Free')}
              </Text>
            </Row>
          ) : null}
        </Card>
      ) : (
        <View style={styles.intro}>
          <Chip label={t('draw.badge')} dot tone="neutral" style={styles.selfCenter} />
          <Text variant="body" tone="secondary" align="center">
            {t('draw.subtitle')}
          </Text>
        </View>
      )}

      <Card padding={space[4]}>
        <Row style={styles.between}>
          <Row gap={space[2]}>
            <View style={[styles.dot, { backgroundColor: committed && slot1.locked ? colors.amber : colors.accent }]} />
            <Text variant="label" tone={committed && slot1.locked ? 'amber' : 'primary'}>
              {committed && slot1.locked ? t('machine.funSpins') : t('draw.machine')}
            </Text>
          </Row>
          <Row gap={space[2]}>
            <Text variant="label" tone="accent">
              {status}
            </Text>
            <View style={[styles.vsep, { backgroundColor: colors.borderStrong }]} />
            <Text variant="monoSm" tone="secondary">
              {`01–${pad2(hustles.length)}`}
            </Text>
          </Row>
        </Row>

        {/* Screen readers hear one label instead of the spinning names. */}
        <View
          style={styles.reels}
          accessible
          accessibilityLabel={`${t('draw.machine')}. ${status}${machine.phase === 'done' && result ? `: ${l(result.name)}` : ''}`}
          accessibilityLiveRegion="polite">
          <SlotReels
            strips={machine.reelStrips}
            headers={[t('draw.reel1'), t('draw.reel2'), t('draw.reel3')]}
            spinKey={machine.spinKey}
            weights={[1.7, 1, 1]}
            onTick={machine.onTick}
            onReelStop={machine.onReelStop}
            onSettled={machine.onSettled}
          />
        </View>

        <Row style={styles.between}>
          <Text variant="label" tone="secondary">
            {t('draw.spinsFree')}
          </Text>
          <Text variant="monoSm" tone="accent">
            {t('draw.spinCount', { count: Math.max(1, state.spinCount + (machine.phase === 'spinning' ? 1 : 0)) })}
          </Text>
        </Row>
      </Card>

      <Button
        label={machine.phase === 'spinning' ? t('draw.ctaSpinning') : t('draw.cta')}
        icon={SlidersHorizontal}
        onPress={spin}
        disabled={machine.phase === 'spinning'}
        haptic={null}
        style={styles.bigCta}
      />
      <Text variant="body" tone="secondary" align="center">
        {t('draw.poolCaption')}
      </Text>

      {committed && slot1.locked ? (
        <Card>
          <Row align="flex-start">
            <IconTile icon={Zap} tone="amber" size={44} />
            <View style={styles.flex}>
              <Row gap={space[2]}>
                <Text variant="h3">{t('machine.pivotTitle')}</Text>
                {account.fastPivotCredits > 0 ? <Chip label={t('machine.pivotAvailable', { count: account.fastPivotCredits })} tone="accent" /> : null}
              </Row>
              <Text variant="bodySm" tone="secondary">
                {account.fastPivotCredits > 0 ? t('machine.pivotCredits', { count: account.fastPivotCredits }) : t('machine.pivotSub')}
              </Text>
            </View>
          </Row>
          <Text variant="bodySm" style={styles.mt12}>
            {account.fastPivotCredits > 0 ? t('machine.pivotHowTo') : t('machine.pivotBody')}
          </Text>
          {account.fastPivotCredits > 0 ? (
            <Button label={t('machine.pivotUse')} icon={Repeat} variant="accentOutline" size="md" onPress={startPivot} loading={pivoting} style={styles.mt12} />
          ) : (
            <Button
              label={t('machine.pivotCta', { price: purchases.oneTime.fast_pivot.priceString })}
              icon={Zap}
              variant="secondary"
              size="md"
              onPress={() => openOneTimePurchase('fast_pivot')}
              style={styles.mt12}
            />
          )}
          {tier !== 'elite' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openPaywall('second_slot', 'elite')}
              style={[styles.slotRow, { backgroundColor: colors.violetSoft, borderColor: colors.violetBorder }]}>
              <Icon icon={Layers} size={16} tone="violet" />
              <Text variant="bodySm" tone="violet" style={styles.flex}>
                {t('machine.secondSlotBody')}
              </Text>
              <Text variant="label" tone="violet">
                {t('tiers.elite')}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <Card>
          <SectionHeader label={t('draw.rulesTitle')} right={t('draw.rulesRight')} rightTone="accent" />
          <Divider style={styles.divider} />
          <Row align="flex-start">
            <MiniStat label={t('draw.statPool')} value={String(hustles.length)} sub={t('draw.statPoolSub')} />
            <MiniStat label={t('draw.statCommit')} value="30" sub={t('draw.statCommitSub')} accent />
            <MiniStat label={t('draw.statCost')} value={formatMoney(0, currency, language, { decimals: 0 })} sub={t('draw.statCostSub')} />
          </Row>
        </Card>
      )}

      <SectionHeader label={t('draw.poolTitle')} right={t('draw.poolRight')} dot style={styles.sectionGap} />
      {hustles.slice(0, 3).map((h) => (
        <Card key={h.id} padding={space[4]}>
          <Row>
            <View style={[styles.num, { backgroundColor: colors.elevated }]}>
              <Text variant="metricMd" tone="secondary">
                #{pad2(h.number)}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {l(h.name)}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('common.hPerWeek', { value: `${h.hours[0]}–${h.hours[1]}` })} · {t(`difficulty.${difficultyLabel(h.difficulty)}`)}
              </Text>
            </View>
            <IconTile icon={h.icon} tone="neutral" size={36} />
          </Row>
        </Card>
      ))}
      <Button label={t('draw.seeAll')} variant="secondary" size="md" iconRight={ChevronRight} onPress={() => setPoolOpen(true)} />

      <BottomSheet visible={poolOpen} onClose={() => setPoolOpen(false)} title={t('draw.sheetTitle')} subtitle={t('draw.sheetBody')} scroll>
        {hustles.map((h, i) => (
          <ListRow
            key={h.id}
            icon={h.icon}
            title={`${pad2(h.number)}  ${l(h.name)}`}
            sub={`${t('common.hPerWeek', { value: `${h.hours[0]}–${h.hours[1]}` })} · ${t(`difficulty.${difficultyLabel(h.difficulty)}`)}`}
            divider={i > 0}
          />
        ))}
      </BottomSheet>

      <HustleResultSheet
        visible={sheet === 'result'}
        hustle={result}
        target={target}
        fastPivotCredits={account.fastPivotCredits}
        onClose={() => setSheet('none')}
        onChoose={() => {
          setPivot(false);
          setSheet('commit');
        }}
        onFastPivot={() => {
          setPivot(true);
          setSheet('commit');
        }}
        onGetFastPivot={() => afterSheet(() => openOneTimePurchase('fast_pivot'))}
        onSecondSlot={() => afterSheet(() => openPaywall('second_slot', 'elite'))}
        onSpinAgain={spinAgain}
        onShare={() => {
          setSheet('none');
          if (result) router.push({ pathname: '/share', params: { type: 'machine', hustle: result.id } });
        }}
      />

      <BottomSheet visible={sheet === 'commit'} onClose={() => setSheet('none')} scroll maxHeight={0.92}>
        {result ? (
          <CommitmentPanel
            hustle={result}
            pivot={pivot}
            onDone={() => {
              setSheet('none');
              afterHustleChosen(result?.slug);
            }}
            onNavigate={leaveTo}
          />
        ) : (
          <View />
        )}
      </BottomSheet>
    </Screen>
  );
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <View style={styles.flex}>
      <Text variant="bodySm" tone="secondary">
        {label}
      </Text>
      <Text variant="metricLg" tone={accent ? 'accent' : 'primary'} style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: space[2],
  },
  selfCenter: {
    alignSelf: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  mt4: {
    marginTop: 4,
  },
  mt12: {
    marginTop: space[3],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vsep: {
    width: 1,
    height: 14,
  },
  reels: {
    marginVertical: space[4],
  },
  bigCta: {
    minHeight: 64,
  },
  divider: {
    marginVertical: space[4],
  },
  statValue: {
    fontSize: 28,
    lineHeight: 34,
    marginVertical: 2,
  },
  sectionGap: {
    marginTop: space[2],
  },
  num: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space[3],
    marginTop: space[3],
  },
});
