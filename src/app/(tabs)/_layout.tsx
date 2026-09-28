import { Redirect, Tabs } from 'expo-router';
import { ChartColumn, Compass, GitFork, Settings, SquareTerminal, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { useAccount } from '@/state/AccountProvider';
import { needsOnboarding } from '@/state/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

function TabIcon({ glyph: Glyph, color, focused }: { glyph: LucideIcon; color: ColorValue; focused: boolean }) {
  return <Glyph size={22} color={color as string} strokeWidth={focused ? 1.9 : 1.5} />;
}

type IconProps = { color: ColorValue; focused: boolean };

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const account = useAccount();

  // No active hustle (e.g. right after a Fast Pivot): back to the machine to choose one.
  if (account.signedIn && account.profile && !needsOnboarding(account.profile) && account.userHustles.length === 0) {
    return <Redirect href="/draw" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 11,
          letterSpacing: 0.2,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="today" options={{ title: t('tabs.today'), tabBarIcon: (p: IconProps) => <TabIcon glyph={Compass} {...p} /> }} />
      <Tabs.Screen name="roadmap" options={{ title: t('tabs.roadmap'), tabBarIcon: (p: IconProps) => <TabIcon glyph={GitFork} {...p} /> }} />
      <Tabs.Screen name="coach" options={{ title: t('tabs.coach'), tabBarIcon: (p: IconProps) => <TabIcon glyph={SquareTerminal} {...p} /> }} />
      <Tabs.Screen name="progress" options={{ title: t('tabs.progress'), tabBarIcon: (p: IconProps) => <TabIcon glyph={ChartColumn} {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: (p: IconProps) => <TabIcon glyph={Settings} {...p} /> }} />
    </Tabs>
  );
}
