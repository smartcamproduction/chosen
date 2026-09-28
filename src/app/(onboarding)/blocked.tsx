import { ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { IconTile, Text } from '@/components/ui';
import { space } from '@/theme/tokens';

/** Shown to people under 18. There is intentionally no way forward. */
export default function Blocked() {
  const { t } = useTranslation();
  return (
    <Screen header="minimal" scroll={false}>
      <View style={styles.center}>
        <IconTile icon={ShieldAlert} tone="amber" size={64} />
        <Text variant="h1" align="center">
          {t('blocked.title')}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {t('blocked.body')}
        </Text>
        <Text variant="bodySm" tone="tertiary" align="center">
          {t('blocked.note')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    paddingHorizontal: space[6],
  },
});
