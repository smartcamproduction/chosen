import { router } from 'expo-router';
import { LogIn, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, IconTile, Text } from '@/components/ui';
import { useHaptics } from '@/lib/haptics';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { nextRoute } from '@/state/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

/**
 * Sign in with email + password: only for accounts that already exist
 * (the App Review demo account, test accounts you created in Supabase).
 * New users sign up with Apple or Google.
 */
export default function EmailSignIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const haptics = useHaptics();
  const { signInWithEmail } = useAccount();
  const { state } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await signInWithEmail(email, password);
    setBusy(false);
    if (!result.ok) {
      haptics('error');
      setError(result.error === 'offline' ? t('common.offline') : t('auth.emailFailed'));
      return;
    }
    haptics('success');
    if (router.canGoBack()) router.back();
    router.replace(nextRoute({ signedIn: true, ...result.snapshot }, state));
  };

  const inputStyle = [styles.input, { backgroundColor: colors.recessed, borderColor: colors.borderStrong, color: colors.text }];

  return (
    <Screen
      header={<StepHeader title={t('auth.emailTitle')} />}
      gap={space[3]}
      footer={<Button label={t('auth.emailCta')} icon={LogIn} onPress={submit} disabled={!valid} loading={busy} haptic="medium" />}>
      <View style={styles.hero}>
        <IconTile icon={Mail} size={56} />
      </View>
      <Text variant="body" tone="secondary" align="center">
        {t('auth.emailBody')}
      </Text>
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          {t('auth.emailLabel')}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          returnKeyType="next"
          maxFontSizeMultiplier={1.6}
          accessibilityLabel={t('auth.emailLabel')}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          {t('auth.passwordLabel')}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          maxFontSizeMultiplier={1.6}
          accessibilityLabel={t('auth.passwordLabel')}
          style={inputStyle}
        />
      </View>
      {error ? (
        <Text variant="bodySm" tone="danger" align="center" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="tertiary" align="center">
        {t('auth.emailNewUsers')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: space[3],
  },
  field: {
    gap: space[2],
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: fonts.regular,
    fontSize: 16,
  },
});
