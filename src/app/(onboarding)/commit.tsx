import { router } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { CommitmentPanel } from '@/components/machine/CommitmentPanel';
import { Screen } from '@/components/Screen';
import { Button, Text } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { useHustles } from '@/state/HustlesProvider';
import { useAfterHustleChosen } from '@/state/usePaywallTriggers';
import { space } from '@/theme/tokens';

/**
 * Full-screen commitment, shown after the sign-up steps (age → consent →
 * questions) to lock in the hustle the user picked on the machine.
 */
export default function Commit() {
  const { t } = useTranslation();
  const { state } = useApp();
  const { byId } = useHustles();
  const afterHustleChosen = useAfterHustleChosen();
  const hustle = byId(state.pendingHustleId);

  if (!hustle) {
    return (
      <Screen header="minimal" gap={space[4]}>
        <Text variant="h2">{t('commit.noHustle')}</Text>
        <Button label={t('commit.spin')} icon={SlidersHorizontal} onPress={() => router.replace('/draw')} />
      </Screen>
    );
  }

  return (
    <Screen header="minimal" gap={space[4]}>
      <Text variant="display">{t('commit.title')}</Text>
      <CommitmentPanel hustle={hustle} onDone={() => afterHustleChosen(hustle.slug)} onNavigate={(route) => router.push(route)} />
    </Screen>
  );
}
