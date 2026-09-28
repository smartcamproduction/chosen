import type { ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { GUTTER, space } from '@/theme/tokens';

import { AppHeader } from './AppHeader';

interface ScreenProps {
  children: ReactNode;
  /** "app" = brand header with chip + avatar, "minimal" = brand only, "none" = nothing, or a custom node. */
  header?: 'app' | 'minimal' | 'none' | ReactNode;
  headerRight?: ReactNode;
  /** Content that stays pinned at the bottom (e.g. a primary action). */
  footer?: ReactNode;
  scroll?: boolean;
  /** Add the home-indicator inset at the bottom (off for tab screens). */
  bottomInset?: boolean;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: Ref<ScrollView>;
}

export function Screen({
  children,
  header = 'app',
  headerRight,
  footer,
  scroll = true,
  bottomInset = true,
  gap = space[3],
  contentStyle,
  scrollRef,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = bottomInset ? insets.bottom : 0;

  let headerNode: ReactNode = null;
  if (header === 'app' || header === 'minimal') headerNode = <AppHeader variant={header as 'app' | 'minimal'} right={headerRight} />;
  else if (header !== 'none') headerNode = header;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {headerNode}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.content, { gap, paddingBottom: (footer ? space[4] : space[10]) + (footer ? 0 : bottomPad) }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: bottomPad + space[3], borderTopColor: colors.border, backgroundColor: colors.bg }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: GUTTER,
    paddingTop: space[4],
  },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: space[3],
    borderTopWidth: 1,
    gap: space[2],
  },
});
