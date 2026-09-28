import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Dial } from '@/components/Dial';
import { Screen } from '@/components/Screen';
import { SignInButtons } from '@/components/SignInButtons';
import { StepHeader } from '@/components/StepHeader';
import { Button, Chip, Text } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { nextRoute } from '@/state/hooks';
import { space } from '@/theme/tokens';

/** Sign-in for people who already have an account. */
export default function SignIn() {
  const { t } = useTranslation();
  const { state } = useApp();

  return (
    <Screen header={<StepHeader title={t('auth.kicker')} />} gap={space[4]}>
      <View style={styles.dial}>
        <Dial size={180} label={t('welcome.dialLocked')} />
      </View>
      <Chip label={t('welcome.badgeAge')} icon={ShieldCheck} style={styles.center} />
      <Text variant="h1" align="center">
        {t('auth.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center">
        {t('auth.body')}
      </Text>

      <SignInButtons
        onSignedIn={({ snapshot }) => router.replace(nextRoute({ signedIn: true, ...snapshot }, state))}
      />

      <Text variant="caption" tone="tertiary" align="center">
        {t('auth.footer')}
      </Text>
      <Button label={t('auth.newHere')} variant="ghost" size="md" onPress={() => router.replace('/draw')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dial: {
    alignItems: 'center',
  },
  center: {
    alignSelf: 'center',
  },
});
