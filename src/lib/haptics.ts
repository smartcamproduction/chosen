import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useApp } from '@/state/AppState';

export type HapticKind = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function fireHaptic(kind: HapticKind) {
  if (Platform.OS === 'web') return;
  const run = () => {
    switch (kind) {
      case 'selection':
        return Haptics.selectionAsync();
      case 'light':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'medium':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'heavy':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'warning':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'error':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };
  run()?.catch(() => {});
}

/** Haptics that respect the user's "Haptics" switch in Profile. */
export function useHaptics() {
  const { state } = useApp();
  return (kind: HapticKind) => {
    if (state.haptics) fireHaptic(kind);
  };
}
