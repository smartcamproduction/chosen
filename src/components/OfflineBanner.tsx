import { CloudOff, RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Button, EmptyState, Icon, Text } from '@/components/ui';
import { useOnline } from '@/lib/network';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * A small "You're offline" pill at the top of every screen while there's
 * no connection. Taps go through it.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 4 }]}>
      <Animated.View
        entering={FadeInUp}
        exiting={FadeOutUp}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.pill, { backgroundColor: colors.elevated, borderColor: colors.amberBorder }]}>
        <Icon icon={CloudOff} size={14} tone="amber" />
        <Text variant="caption" tone="amber" maxFontSizeMultiplier={1.4}>
          {t('states.offlineBanner')}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Signed in, offline, and nothing saved on this phone yet. */
export function ConnectionError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen header="minimal">
      <EmptyState icon={CloudOff} title={t('states.noConnectionTitle')} body={t('states.noConnectionBody')} />
      <Button label={t('common.retry')} icon={RotateCcw} onPress={onRetry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radius.round,
    borderWidth: 1,
  },
});
