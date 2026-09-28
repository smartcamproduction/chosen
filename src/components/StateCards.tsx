import { CloudOff, RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, IconTile, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** A card with a spinner while data is on its way. */
export function LoadingCard({ label }: { label?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card accessibilityLabel={label ?? t('common.loading')}>
      <Row gap={space[3]} style={styles.center}>
        <ActivityIndicator color={colors.accent} accessibilityLabel={label ?? t('common.loading')} />
        <Text variant="body" tone="secondary">
          {label ?? t('common.loading')}
        </Text>
      </Row>
    </Card>
  );
}

/** Something couldn't be loaded: what happened and a Try again button. */
export function ErrorCard({ title, body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card accessibilityRole="alert">
      <Row align="flex-start">
        <IconTile icon={CloudOff} tone="amber" size={40} />
        <View style={styles.flex}>
          <Text variant="body" weight="semibold">
            {title ?? t('states.loadFailedTitle')}
          </Text>
          <Text variant="bodySm" tone="secondary">
            {body ?? t('states.loadFailedBody')}
          </Text>
        </View>
      </Row>
      {onRetry ? <Button label={t('common.retry')} icon={RotateCcw} variant="secondary" size="md" onPress={onRetry} style={styles.mt12} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  mt12: {
    marginTop: space[3],
  },
});
