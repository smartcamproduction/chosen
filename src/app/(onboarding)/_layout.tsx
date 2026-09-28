import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

/** Onboarding flow: welcome → quiz → consent → draw → reveal → commit. */
export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
