import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import type { RewardResult } from '@/lib/progression';
import type { Roadmap } from '@/lib/roadmap';

import { useProgressData, type ProgressError } from './ProgressProvider';
import { useRewards } from './RewardsProvider';

/** Opens a roadmap step (slot 2 = the Elite second hustle). */
export function openStep(step: { id: string }, slot: 1 | 2 = 1, replace = false) {
  const href = { pathname: '/task/[id]' as const, params: { id: step.id, slot: String(slot) } };
  if (replace) router.replace(href);
  else router.push(href);
}

/** Friendly message for anything that can go wrong with a step or check-in. */
export function useProgressErrorText() {
  const { t } = useTranslation();
  return (error: ProgressError) => {
    switch (error) {
      case 'step_locked':
        return t('progressErrors.stepLocked');
      case 'already_done':
        return t('progressErrors.alreadyDone');
      case 'checkin_not_open':
        return t('progressErrors.checkinNotOpen');
      case 'checkin_already_done':
        return t('progressErrors.checkinDone');
      case 'upload_failed':
        return t('progressErrors.upload');
      case 'invalid_amount':
        return t('progressErrors.amount');
      case 'unsupported_currency':
        return t('progressErrors.currency');
      case 'offline':
        return t('common.offline');
      default:
        return t('common.error');
    }
  };
}

/** "Mark as done": asks the server, then plays the small celebration. */
export function useStepActions() {
  const { completeStep } = useProgressData();
  const { celebrate } = useRewards();
  const haptics = useHaptics();
  const errorText = useProgressErrorText();
  const [busyId, setBusyId] = useState<string | null>(null);

  const complete = async (userHustleId: string | undefined, stepId: string, roadmap: Roadmap): Promise<RewardResult | null> => {
    if (busyId || !userHustleId) return null;
    setBusyId(stepId);
    const result = await completeStep(userHustleId, stepId, roadmap);
    setBusyId(null);
    if (result.ok) {
      celebrate(result.reward);
      return result.reward;
    }
    if (result.error === 'already_done') return null;
    haptics('error');
    Alert.alert(errorText(result.error));
    return null;
  };

  return { complete, busyId };
}
