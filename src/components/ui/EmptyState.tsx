import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, body, action, style }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconBox, { backgroundColor: colors.elevated, borderColor: colors.borderStrong }]}>
        <Icon icon={icon} size={26} tone="accent" />
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="secondary" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button label={action.label} icon={action.icon} onPress={action.onPress} variant="secondary" size="md" fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: space[8],
    paddingHorizontal: space[6],
    gap: space[3],
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[1],
  },
  body: {
    maxWidth: 300,
  },
  action: {
    alignSelf: 'center',
    marginTop: space[2],
  },
});
