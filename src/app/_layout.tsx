import '@/i18n';
import '@/lib/webAlert';

import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConnectionError, OfflineBanner } from '@/components/OfflineBanner';
import { RewardToastHost } from '@/components/RewardToast';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageProvider';
import { useNotificationTaps } from '@/lib/notifications';
import { AccountProvider, useAccount } from '@/state/AccountProvider';
import { AppStateProvider, useApp } from '@/state/AppState';
import { HustlesProvider } from '@/state/HustlesProvider';
import { ProgressProvider } from '@/state/ProgressProvider';
import { PurchasesProvider } from '@/state/PurchasesProvider';
import { RewardsProvider } from '@/state/RewardsProvider';
import { RoadmapsProvider } from '@/state/RoadmapsProvider';
import { useAnalyticsBridge } from '@/state/useAnalyticsBridge';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AppStateProvider>
              <AccountProvider>
                <PurchasesProvider>
                  <HustlesProvider>
                    <ProgressProvider>
                      <RoadmapsProvider>
                        <RewardsProvider>
                          <RootNavigator fontsReady={fontsLoaded || !!fontError} />
                        </RewardsProvider>
                      </RoadmapsProvider>
                    </ProgressProvider>
                  </HustlesProvider>
                </PurchasesProvider>
              </AccountProvider>
            </AppStateProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { colors, isDark, ready: themeReady } = useTheme();
  const { ready: languageReady } = useLanguage();
  const { ready: appReady } = useApp();
  const { ready: accountReady, signedIn, loadFailed, retryLoad } = useAccount();
  const ready = fontsReady && themeReady && languageReady && appReady && accountReady;
  useNotificationTaps(ready);
  useAnalyticsBridge(ready);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.bg,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
      },
    };
  }, [isDark, colors]);

  if (!ready) return null;

  // Signed in, offline, and nothing saved on this phone yet.
  if (signedIn && loadFailed) {
    return (
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ConnectionError onRetry={retryLoad} />
      </NavigationThemeProvider>
    );
  }

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="task/[id]" />
        <Stack.Screen name="machine" />
        <Stack.Screen name="check-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="share" options={{ presentation: 'modal' }} />
        <Stack.Screen name="celebration" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="push-intro" options={{ presentation: 'modal' }} />
        <Stack.Screen name="email-sign-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal" />
        <Stack.Screen name="admin" />
      </Stack>
      <RewardToastHost />
      <OfflineBanner />
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
