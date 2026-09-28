import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Card, Chip, ProgressBar, Row, Text, Toggle } from '@/components/ui';
import { isAnswered, QUESTIONS, type QuizAnswers, type QuizDraft } from '@/data/quiz';
import { track } from '@/lib/analytics';
import type { Json } from '@/lib/database.types';
import { useHaptics } from '@/lib/haptics';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { nextRoute, useQuiz } from '@/state/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, GUTTER, radius, space } from '@/theme/tokens';

const TOTAL = QUESTIONS.length;

/** One onboarding question per screen: /quiz/1 … /quiz/16. */
export default function QuizStep() {
  const { t } = useTranslation();
  // Question/option keys are built from data, so they're typed loosely here.
  // `npm run check:i18n` keeps both languages complete.
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const { colors } = useTheme();
  const { step, edit } = useLocalSearchParams<{ step: string; edit?: string }>();
  const { state, update } = useApp();
  const account = useAccount();
  const saved = useQuiz();
  const haptics = useHaptics();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = Math.min(TOTAL - 1, Math.max(0, (Number(step) || 1) - 1));
  const question = QUESTIONS[index];
  const isLast = index === TOTAL - 1;

  // Saved answers (when editing) + defaults + what the user changed on this run.
  const base: QuizDraft = saved
    ? { ...saved }
    : { currency: state.currency, runsBusiness: false };
  const draft: QuizDraft = { ...base, ...state.quizDraft };
  const [code, setCode] = useState(draft.referralCode ?? '');

  // Always build on the latest answers so quick taps never overwrite each other.
  const set = (patch: QuizDraft) => update((prev) => ({ quizDraft: { ...prev.quizDraft, ...patch } }));
  const value = question.id === 'referral' ? undefined : (draft[question.id as keyof QuizDraft] as unknown);

  const pickSingle = (option: string) => {
    haptics('selection');
    set({ [question.id]: option } as QuizDraft);
  };

  const toggleMulti = (option: string) => {
    haptics('selection');
    const key = question.id as 'skills' | 'why';
    update((prev) => {
      const current = (({ ...base, ...prev.quizDraft })[key] as string[] | undefined) ?? [];
      let nextValues: string[];
      if (current.includes(option)) nextValues = current.filter((o) => o !== option);
      else if (option === question.exclusive) nextValues = [option];
      else nextValues = [...current.filter((o) => o !== question.exclusive), option];
      return { quizDraft: { ...prev.quizDraft, [key]: nextValues } };
    });
  };

  const goTo = (i: number) =>
    router.push({ pathname: '/quiz/[step]', params: edit ? { step: String(i + 1), edit } : { step: String(i + 1) } });

  const finish = async () => {
    const missing = QUESTIONS.findIndex((q) => !isAnswered(q, draft));
    if (missing !== -1) {
      goTo(missing);
      return;
    }
    setBusy(true);
    setError(null);

    let referralCode = draft.referralCode ?? null;
    const entered = code.trim().toUpperCase();
    if (entered && entered !== referralCode && !account.profile?.referred_by) {
      const ok = await account.redeemReferral(entered);
      if (!ok) {
        setBusy(false);
        haptics('error');
        setError(t('quiz.referral.invalid'));
        return;
      }
      referralCode = entered;
    }

    const answers = {
      ...draft,
      version: 1,
      source: draft.source ?? null,
      runsBusiness: draft.runsBusiness ?? false,
      referralCode,
      completedAt: new Date().toISOString(),
    } as QuizAnswers;

    const result = await account.updateProfile({ quiz: answers as unknown as Json, currency: answers.currency });
    setBusy(false);
    if (!result.ok) {
      haptics('error');
      setError(t('common.offline'));
      return;
    }
    haptics('success');
    if (!edit) {
      track('quiz_completed', {
        hours: answers.hours,
        budget: answers.budget,
        income_goal: answers.incomeGoal,
        first_earnings: answers.firstEarnings,
        experience: answers.experience,
        currency: answers.currency,
        source: answers.source,
        has_referral: !!answers.referralCode,
      });
    }
    update({ quizDraft: {} });
    if (edit) router.dismissTo('/profile');
    else router.replace(nextRoute({ signedIn: true, profile: result.profile, userHustles: account.userHustles }, state));
  };

  const next = () => (isLast ? finish() : goTo(index + 1));
  const canContinue = isAnswered(question, draft);

  const header = (
    <View>
      <StepHeader
        title={t('quiz.badge')}
        sub={t('quiz.stepOf', { step: index + 1, total: TOTAL })}
        right={
          question.optional && !isLast ? (
            <Pressable accessibilityRole="button" onPress={next} hitSlop={10}>
              <Text variant="body" tone="secondary">
                {t('quiz.skip')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      <ProgressBar value={(index + 1) / TOTAL} height={4} style={styles.progress} accessibilityLabel={t('quiz.stepOf', { step: index + 1, total: TOTAL })} />
    </View>
  );

  return (
    <Screen
      header={header}
      gap={space[3]}
      footer={
        <>
          {error ? (
            <Text variant="bodySm" tone="danger" align="center">
              {error}
            </Text>
          ) : null}
          <Button
            label={isLast ? t('quiz.finish') : t('common.continue')}
            iconRight={ArrowRight}
            onPress={next}
            disabled={!canContinue}
            loading={busy}
            haptic={null}
          />
          <Text variant="caption" tone="tertiary" align="center">
            {t('quiz.hint')}
          </Text>
        </>
      }>
      <View style={styles.intro}>
        <Row gap={space[2]}>
          <View style={[styles.kickerDot, { backgroundColor: colors.accent }]} />
          <Text variant="label" tone="accent">
            {tx(`quiz.${question.id}.kicker`)}
          </Text>
          {question.optional ? <Chip label={t('quiz.optional')} /> : null}
        </Row>
        <Text variant="h1">{tx(`quiz.${question.id}.title`)}</Text>
        <Text variant="body" tone="secondary">
          {tx(`quiz.${question.id}.body`)}
        </Text>
      </View>

      {question.kind === 'single' &&
        question.options.map((option) => (
          <OptionCard
            key={option}
            title={tx(`quiz.${question.id}.${option}`)}
            selected={value === option}
            onPress={() => pickSingle(option)}
          />
        ))}

      {question.kind === 'multi' && (
        <View style={styles.chips}>
          {question.options.map((option) => {
            const selected = ((value as string[] | undefined) ?? []).includes(option);
            return (
              <Chip
                key={option}
                label={tx(`quiz.${question.id}.${option}`)}
                caps={false}
                size="md"
                selected={selected}
                icon={selected ? Check : undefined}
                onPress={() => toggleMulti(option)}
              />
            );
          })}
        </View>
      )}

      {question.id === 'employment' ? (
        <Card padding={space[4]}>
          <Row>
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {t('quiz.employment.business')}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('quiz.employment.businessHint')}
              </Text>
            </View>
            <Toggle value={draft.runsBusiness ?? false} onChange={(v) => set({ runsBusiness: v })} accessibilityLabel={t('quiz.employment.business')} />
          </Row>
        </Card>
      ) : null}

      {question.kind === 'text' ? (
        <View style={styles.field}>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setError(null);
              setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
            }}
            placeholder={t('quiz.referral.placeholder')}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('quiz.referral.title')}
            style={[styles.input, { backgroundColor: colors.recessed, borderColor: error ? colors.danger : colors.borderStrong, color: colors.text }]}
          />
          {draft.referralCode ? (
            <Text variant="bodySm" tone="accent">
              {t('quiz.referral.applied')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function OptionCard({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card variant={selected ? 'accent' : 'default'} padding={space[4]} onPress={onPress} accessibilityLabel={title}>
      <Row>
        <Text variant="body" weight="semibold" style={styles.flex}>
          {title}
        </Text>
        <View
          style={[
            styles.radio,
            selected ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: colors.elevated, borderColor: colors.borderStrong },
          ]}>
          {selected ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  progress: {
    marginHorizontal: GUTTER,
    marginTop: space[3],
  },
  intro: {
    gap: space[2],
    marginBottom: space[2],
  },
  kickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  flex: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: space[2],
  },
  input: {
    minHeight: 56,
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[4],
    fontFamily: fonts.monoSemibold,
    fontSize: 20,
    letterSpacing: 2,
  },
});
