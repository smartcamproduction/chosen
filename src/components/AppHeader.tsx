import { router } from 'expo-router';
import { User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, radius, space } from '@/theme/tokens';

import { LogoMark, Wordmark } from './LogoMark';
import { Text } from './ui';

interface AppHeaderProps {
  /** "app" shows the commitment chip and avatar; "minimal" only the brand. */
  variant?: 'app' | 'minimal';
  right?: ReactNode;
}

export function AppHeader({ variant = 'app', right }: AppHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.brand}>
        <LogoMark size={38} />
        <Wordmark size={19} />
      </View>

      {variant === 'app' ? (
        <View style={styles.right}>
          <View style={[styles.modeChip, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text variant="label" tone="accent" numberOfLines={1} style={styles.shrink}>
              {t('header.commitmentMode')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tabs.profile')}
            onPress={() => router.navigate('/profile')}
            style={({ pressed }) => [styles.avatar, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}>
            <User size={20} color={colors.onAccent} strokeWidth={1.75} />
          </Pressable>
        </View>
      ) : (
        right
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingVertical: space[3],
    borderBottomWidth: 1,
    gap: space[2],
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    flexShrink: 1,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexShrink: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
