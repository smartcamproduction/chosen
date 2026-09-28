import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, radius, space } from '@/theme/tokens';

import { IconButton, Text } from './ui';

/** Back button + step pill + optional right action, used in onboarding and detail screens. */
export function StepHeader({ title, sub, right, onBack }: { title: string; sub?: string; right?: ReactNode; onBack?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <IconButton icon={ArrowLeft} accessibilityLabel={t('common.back')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="label" tone="accent" numberOfLines={1} style={styles.shrink}>
          {title}
        </Text>
        {sub ? (
          <>
            <Text variant="monoSm" tone="tertiary">
              {'//'}
            </Text>
            <Text variant="label" tone="secondary" numberOfLines={1} style={styles.noShrink}>
              {sub}
            </Text>
          </>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: GUTTER,
    paddingTop: space[3],
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  noShrink: {
    flexShrink: 0,
  },
});
