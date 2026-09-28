import { Crosshair } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { Text } from './ui';

export function LogoMark({ size = 40 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size >= 40 ? radius.md : 10, backgroundColor: colors.elevated, borderColor: colors.borderStrong },
      ]}>
      <Crosshair size={size * 0.45} color={colors.accentText} strokeWidth={1.5} />
      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
    </View>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <Text variant="h3" weight="semibold" style={{ fontSize: size, lineHeight: size * 1.2, letterSpacing: 0.5 }} accessibilityRole="header">
      CHOSEN
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
