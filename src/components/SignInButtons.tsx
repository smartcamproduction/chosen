import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { canUseNativeApple } from '@/lib/auth';
import { useHaptics } from '@/lib/haptics';
import { useAccount, type SignInResult } from '@/state/AccountProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { AppleLogo, GoogleLogo } from './BrandIcons';
import { Button, Text } from './ui';

/**
 * "Sign in with Apple" + "Continue with Google".
 * On iPhone the official Apple button is used (App Store requirement).
 */
export function SignInButtons({
  disabled,
  onSignedIn,
}: {
  disabled?: boolean;
  onSignedIn: (result: Extract<SignInResult, { ok: true }>) => void;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { signIn, mode } = useAccount();
  const haptics = useHaptics();
  const [nativeApple, setNativeApple] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    canUseNativeApple().then(setNativeApple);
  }, []);

  const run = async (provider: 'apple' | 'google') => {
    if (busy || disabled) return;
    setError(null);
    setBusy(provider);
    const result = await signIn(provider);
    setBusy(null);
    if (result.ok) {
      haptics('success');
      onSignedIn(result);
    } else if (result.cancelled) {
      setError(null);
    } else {
      haptics('error');
      setError(t('auth.failed'));
    }
  };

  return (
    <View style={styles.wrap}>
      {nativeApple && mode === 'supabase' ? (
        <View style={[disabled && styles.disabled]} pointerEvents={disabled || busy ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.lg}
            style={styles.appleNative}
            onPress={() => run('apple')}
          />
        </View>
      ) : (
        <Button
          label={t('auth.apple')}
          variant="apple"
          leading={<AppleLogo color={colors.appleButtonText} />}
          onPress={() => run('apple')}
          disabled={disabled}
          loading={busy === 'apple'}
          haptic={null}
        />
      )}
      <Button
        label={t('auth.google')}
        variant="secondary"
        leading={<GoogleLogo />}
        onPress={() => run('google')}
        disabled={disabled}
        loading={busy === 'google'}
        haptic={null}
      />
      {error ? (
        <Text variant="bodySm" tone="danger" align="center" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {/* Existing email accounts only (e.g. the App Review demo account). */}
      <Pressable
        accessibilityRole="link"
        onPress={() => (disabled || busy ? undefined : router.push('/email-sign-in'))}
        hitSlop={8}
        style={styles.emailLink}>
        <Text variant="bodySm" tone="secondary" align="center">
          {t('auth.emailLink')}
        </Text>
      </Pressable>
      {mode === 'preview' ? (
        <Text variant="caption" tone="amber" align="center">
          {t('auth.previewMode')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[2],
  },
  appleNative: {
    height: 56,
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  emailLink: {
    alignSelf: 'center',
    paddingVertical: space[1],
  },
});
