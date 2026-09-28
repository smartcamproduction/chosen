import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { IconButton } from './Controls';
import { Text } from './Text';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Make the body scrollable for long content. */
  scroll?: boolean;
  /** Max height as a share of the screen (default 0.85). */
  maxHeight?: number;
}

const SPRING = { damping: 24, stiffness: 240, mass: 0.9 };

/** Frosted bottom sheet. Drag the handle down or tap outside to close. */
export function BottomSheet({ visible, onClose, title, subtitle, children, scroll, maxHeight = 0.85 }: BottomSheetProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);

  // Mount the modal as soon as it should open; unmount only after the close animation.
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }

  const translateY = useSharedValue(screenH);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.set(screenH);
      backdrop.set(withTiming(1, { duration: 220 }));
      translateY.set(withSpring(0, SPRING));
    } else {
      backdrop.set(withTiming(0, { duration: 180 }));
      translateY.set(
        withTiming(screenH, { duration: 220 }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, screenH, translateY, backdrop]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        translateY.set(withSpring(0, SPRING));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  // Android can't blur behind a modal without extra setup, so it gets a solid surface.
  const tint = Platform.OS === 'android' ? colors.elevated : colors.overlay;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.flex} onPress={onClose} />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.anchor} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                maxHeight: screenH * maxHeight,
                paddingBottom: insets.bottom + space[4],
                borderColor: colors.borderStrong,
              },
              sheetStyle,
            ]}>
            <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />

            <GestureDetector gesture={pan}>
              <View style={styles.header}>
                <View style={[styles.handle, { backgroundColor: colors.borderActive }]} />
                {title ? (
                  <View style={styles.titleRow}>
                    <View style={styles.flex}>
                      <Text variant="h2">{title}</Text>
                      {subtitle ? (
                        <Text variant="body" tone="secondary" style={styles.subtitle}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <IconButton icon={X} onPress={onClose} accessibilityLabel={t('common.close')} size={36} />
                  </View>
                ) : null}
              </View>
            </GestureDetector>

            {scroll ? (
              <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    boxShadow: '0 -16px 40px rgba(0, 0, 0, 0.45)',
  },
  header: {
    paddingTop: space[2],
    paddingHorizontal: space[5],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: space[4],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    marginBottom: space[4],
  },
  subtitle: {
    marginTop: space[1],
  },
  body: {
    paddingHorizontal: space[5],
    gap: space[3],
  },
});
