import { router, useLocalSearchParams } from 'expo-router';
import { Bell, CalendarCheck, CircleCheck, Megaphone, X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Button, Card, Chip, Icon, IconButton, IconTile, Row, Text } from '@/components/ui';
import { useHaptics } from '@/lib/haptics';
import { enablePush, PUSH_TIMES } from '@/lib/notifications';
import { openPaywall } from '@/lib/paywall';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { GUTTER, space } from '@/theme/tokens';

/**
 * Explains what notifications are for BEFORE the iPhone asks for
 * permission (shown once, after the user chooses a hustle).
 *   /push-intro?then=paywall → the paywall comes next (end of onboarding)
 */
export default function PushIntro() {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const { mode, updateProfile } = useAccount();
  const { update } = useApp();
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(false);

  const next = () => {
    update({ pushAskedAt: new Date().toISOString() });
    if (router.canGoBack()) router.back();
    else router.replace('/today');
    if (then === 'paywall') setTimeout(() => openPaywall('onboarding'), 350);
  };

  const turnOn = async () => {
    if (busy) return;
    if (mode === 'preview') {
      await updateProfile({ notification_time: `${time}:00` });
      Alert.alert(t('profile.pushPreview'), undefined, [{ text: t('common.continue'), onPress: next }]);
      return;
    }
    setBusy(true);
    const result = await enablePush();
    if (result.ok) {
      const saved = await updateProfile({ expo_push_token: result.token, notification_time: `${time}:00` });
      setBusy(false);
      if (!saved.ok) {
        Alert.alert(t('profile.saveFailed'), undefined, [{ text: t('common.continue'), onPress: next }]);
        return;
      }
      haptics('success');
      next();
      return;
    }
    setBusy(false);
    const message =
      result.reason === 'denied'
        ? t('profile.pushDenied')
        : result.reason === 'no_project'
          ? t('profile.pushNoProject')
          : result.reason === 'unsupported'
            ? t('profile.pushWeb')
            : t('common.error');
    Alert.alert(message, undefined, [{ text: t('common.continue'), onPress: next }]);
  };

  const points: { icon: LucideIcon; text: string }[] = [
    { icon: Bell, text: t('pushIntro.b1') },
    { icon: CalendarCheck, text: t('pushIntro.b2') },
    { icon: Megaphone, text: t('pushIntro.b3') },
  ];

  return (
    <Screen
      header={
        <Row style={[styles.header, { paddingTop: insets.top > 0 ? 0 : space[3] }]}>
          <IconButton icon={X} accessibilityLabel={t('pushIntro.later')} onPress={next} />
        </Row>
      }
      gap={space[4]}
      footer={
        <>
          <Button label={t('pushIntro.cta')} icon={Bell} onPress={turnOn} loading={busy} haptic="medium" />
          <Button label={t('pushIntro.later')} variant="ghost" size="md" onPress={next} disabled={busy} />
        </>
      }>
      <View style={styles.hero}>
        <IconTile icon={Bell} size={72} />
      </View>
      <Text variant="h1" align="center">
        {t('pushIntro.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center">
        {t('pushIntro.body')}
      </Text>

      <Card>
        <View style={styles.points}>
          {points.map((p) => (
            <Row key={p.text} gap={space[3]} align="flex-start">
              <Icon icon={p.icon} size={18} tone="accent" />
              <Text variant="body" style={styles.flex}>
                {p.text}
              </Text>
            </Row>
          ))}
        </View>
      </Card>

      <View style={styles.timeBlock}>
        <Text variant="label" tone="secondary">
          {t('pushIntro.timeLabel')}
        </Text>
        <View style={styles.times} accessibilityRole="radiogroup">
          {PUSH_TIMES.map((option) => (
            <Chip key={option} label={option} caps={false} size="md" selected={time === option} onPress={() => setTime(option)} />
          ))}
        </View>
        <Row gap={space[2]}>
          <Icon icon={CircleCheck} size={14} tone="tertiary" />
          <Text variant="caption" tone="tertiary" style={styles.flex}>
            {t('pushIntro.changeLater')}
          </Text>
        </Row>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: GUTTER,
    paddingBottom: space[2],
  },
  hero: {
    alignItems: 'center',
    marginTop: space[4],
  },
  points: {
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
  timeBlock: {
    gap: space[2],
  },
  times: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
