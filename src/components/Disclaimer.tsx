import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/ui';

/**
 * "Not financial advice. Results vary and are not guaranteed."
 * Shown on the result sheet, the paywall and Progress.
 */
export function Disclaimer({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  return (
    <Text variant="caption" tone="tertiary" align="center" style={[styles.text, style]}>
      {t('legal.disclaimer')}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    alignSelf: 'center',
  },
});
